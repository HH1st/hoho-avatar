import { AsyncQueue } from "./queue";
import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "./pcm";
import type { VuiInput, VuiRuntimeOptions, VuiSessionOptions, VuiState } from "./types";

type ProcessInput =
  | { type: "audio"; pcm: Float32Array; sampleRate: number }
  | { type: "text"; text: string }
  | { type: "interrupt" };

interface RealtimeEvent {
  type?: string;
  delta?: string;
  response_id?: string;
  response?: { id?: string };
  error?: { message?: string };
  message?: string;
}

type OutputEvent =
  | { type: "audio"; pcm: Int16Array; generation: number }
  | { type: "transcript"; delta: string; generation: number }
  | { type: "user-speech-start"; generation: number }
  | { type: "user-speech-end"; generation: number }
  | { type: "response-start"; generation: number }
  | { type: "response-end"; generation: number }
  | { type: "stop-output"; generation: number }
  | { type: "error"; error: Error };

interface RuntimeQueues {
  ingress: AsyncQueue<VuiInput>;
  input: AsyncQueue<ProcessInput>;
  backend: AsyncQueue<RealtimeEvent>;
  output: AsyncQueue<OutputEvent>;
}

/** Minimal full-duplex VUI runtime: one input, process, and output loop. */
export class VuiRuntime {
  private socket?: WebSocket;
  private queues?: RuntimeQueues;
  private currentState: VuiState = "idle";
  private connectPromise?: Promise<void>;
  private pendingConnect?: { resolve: () => void; reject: (error: Error) => void };
  private sessionOptions: VuiSessionOptions = {};
  private connection = 0;
  private generation = 0;
  private outputActive = false;
  private activeResponseGeneration?: number;
  private readonly responseGenerations = new Map<string, number>();

  constructor(private readonly options: VuiRuntimeOptions) {}

  get state(): VuiState {
    return this.currentState;
  }

  connect(sessionOptions: VuiSessionOptions = {}): Promise<void> {
    this.assertActive();
    if (this.currentState === "connected") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.sessionOptions = sessionOptions;
    this.generation = 0;
    this.outputActive = false;
    this.activeResponseGeneration = undefined;
    this.responseGenerations.clear();
    const queues: RuntimeQueues = {
      ingress: new AsyncQueue(),
      input: new AsyncQueue(),
      backend: new AsyncQueue(),
      output: new AsyncQueue(),
    };
    this.queues = queues;
    const connection = ++this.connection;
    this.setState("connecting");

    const operation = new Promise<void>((resolve, reject) => {
      this.pendingConnect = { resolve, reject };
      const socket = new WebSocket(this.options.gatewayUrl);
      this.socket = socket;
      socket.onmessage = (message) => {
        if (connection !== this.connection) return;
        try { queues.backend.push(JSON.parse(String(message.data)) as RealtimeEvent); } catch { /* Ignore malformed gateway events. */ }
      };
      socket.onerror = () => this.fail(connection, new Error("Unable to connect to the Voice Agent gateway"));
      socket.onclose = (event) => this.handleClose(connection, event.code);

      void Promise.all([
        this.inputLoop(queues),
        this.processLoop(socket, queues),
        this.outputLoop(queues),
      ]).catch((error: unknown) => this.fail(connection, this.asError(error)));
    });
    const tracked = operation.finally(() => {
      if (this.connectPromise === tracked) this.connectPromise = undefined;
    });
    this.connectPromise = tracked;
    return tracked;
  }

  input(event: VuiInput): void {
    if (this.currentState !== "connected") return;
    this.queues?.ingress.push(event, event.type === "interrupt");
  }

  sendAudio(chunk: Float32Array, sampleRate: number): void {
    // AudioContext buffers are reused, so preserve this chunk before async ingestion.
    this.input({ type: "audio", pcm: new Float32Array(chunk), sampleRate });
  }

  sendText(text: string): void {
    this.input({ type: "text", text });
  }

  interrupt(): void {
    this.input({ type: "interrupt" });
  }

  disconnect(): void {
    const socket = this.socket;
    this.connection += 1;
    this.socket = undefined;
    this.closeQueues(true);
    if (this.pendingConnect) {
      this.pendingConnect.reject(new Error("Voice Agent disconnected while connecting"));
      this.pendingConnect = undefined;
    }
    socket?.close(1000, "Client disconnected");
    if (this.currentState !== "destroyed") this.setState("idle");
  }

  destroy(): void {
    if (this.currentState === "destroyed") return;
    this.disconnect();
    this.setState("destroyed");
  }

  private async inputLoop(queues: RuntimeQueues): Promise<void> {
    while (true) {
      const next = await queues.ingress.next();
      if (next.done) { queues.input.close(); return; }
      const event = next.value;
      if (event.type === "audio") {
        if (event.pcm.length > 0) queues.input.push(event);
      } else if (event.type === "text") {
        const text = event.text.trim();
        if (text) queues.input.push({ type: "text", text });
      } else {
        queues.input.push(event, true);
      }
    }
  }

  private processLoop(socket: WebSocket, queues: RuntimeQueues): Promise<void> {
    return Promise.all([
      this.processInput(socket, queues),
      this.processBackend(socket, queues),
    ]).then(() => undefined);
  }

  private async processInput(socket: WebSocket, queues: RuntimeQueues): Promise<void> {
    while (true) {
      const next = await queues.input.next();
      if (next.done) return;
      const event = next.value;
      if (event.type === "audio") {
        const audio = pcm16ToBase64(resampleFloat32ToPCM16(event.pcm, event.sampleRate));
        this.send(socket, { type: "input_audio_buffer.append", audio });
      } else if (event.type === "text") {
        if (this.outputActive) this.invalidateOutput(socket, queues);
        this.send(socket, {
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: event.text }] },
        });
        this.send(socket, { type: "response.create" });
      } else {
        this.invalidateOutput(socket, queues);
      }
    }
  }

  private async processBackend(socket: WebSocket, queues: RuntimeQueues): Promise<void> {
    while (true) {
      const next = await queues.backend.next();
      if (next.done) return;
      const event = next.value;
      switch (event.type) {
        case "gateway.ready":
          this.send(socket, this.sessionUpdate());
          break;
        case "session.updated":
          this.pendingConnect?.resolve();
          this.pendingConnect = undefined;
          this.setState("connected");
          break;
        case "response.created": {
          const responseId = event.response?.id ?? event.response_id;
          if (responseId) this.responseGenerations.set(responseId, this.generation);
          this.activeResponseGeneration = this.generation;
          this.outputActive = true;
          queues.output.push({ type: "response-start", generation: this.generation });
          break;
        }
        case "response.output_audio.delta":
          if (event.delta) queues.output.push({
            type: "audio",
            pcm: base64ToPCM16(event.delta),
            generation: this.eventGeneration(event),
          });
          break;
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
          if (event.delta) queues.output.push({ type: "transcript", delta: event.delta, generation: this.eventGeneration(event) });
          break;
        case "input_audio_buffer.speech_started":
          this.invalidateOutput(socket, queues);
          queues.output.push({ type: "user-speech-start", generation: this.generation });
          break;
        case "input_audio_buffer.speech_stopped":
          queues.output.push({ type: "user-speech-end", generation: this.generation });
          break;
        case "response.done": {
          const responseId = event.response?.id ?? event.response_id;
          const responseGeneration = this.eventGeneration(event);
          if (responseId) this.responseGenerations.delete(responseId);
          if (responseGeneration === this.generation) this.outputActive = false;
          if (this.activeResponseGeneration === responseGeneration) this.activeResponseGeneration = undefined;
          queues.output.push({ type: "response-end", generation: responseGeneration });
          break;
        }
        case "gateway.error":
        case "error": {
          const error = new Error(event.error?.message ?? event.message ?? "Voice Agent request failed");
          if (this.pendingConnect) { this.pendingConnect.reject(error); this.pendingConnect = undefined; }
          this.setState("error");
          queues.output.push({ type: "error", error });
          this.stopLoops(socket, queues);
          return;
        }
      }
    }
  }

  private async outputLoop(queues: RuntimeQueues): Promise<void> {
    while (true) {
      const next = await queues.output.next();
      if (next.done) return;
      const event = next.value;
      if ("generation" in event && event.generation !== this.generation) continue;
      switch (event.type) {
        case "audio": await this.options.onAudio?.(event.pcm); break;
        case "transcript": await this.options.onTranscriptDelta?.(event.delta); break;
        case "user-speech-start": await this.options.onUserSpeechStart?.(); break;
        case "user-speech-end": await this.options.onUserSpeechEnd?.(); break;
        case "response-start": await this.options.onResponseStart?.(); break;
        case "response-end": await this.options.onResponseEnd?.(); break;
        case "stop-output": await this.options.onOutputInterrupted?.(); break;
        case "error": this.options.onError?.(event.error); break;
      }
    }
  }

  private invalidateOutput(socket: WebSocket, queues: RuntimeQueues): void {
    this.generation += 1;
    if (this.outputActive) this.send(socket, { type: "response.cancel" });
    this.outputActive = false;
    this.activeResponseGeneration = undefined;
    queues.output.push({ type: "stop-output", generation: this.generation });
  }

  private eventGeneration(event: RealtimeEvent): number {
    const responseId = event.response_id ?? event.response?.id;
    if (responseId) return this.responseGenerations.get(responseId) ?? -1;
    return this.activeResponseGeneration ?? this.generation;
  }

  private sessionUpdate(): object {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: this.sessionOptions.instructions ?? "You are a concise, friendly voice companion. Respond naturally and briefly.",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24_000 },
            turn_detection: { type: "server_vad", create_response: true, interrupt_response: true },
          },
          output: { format: { type: "audio/pcm", rate: 24_000 }, voice: this.sessionOptions.voice ?? "cedar" },
        },
      },
    };
  }

  private send(socket: WebSocket, event: object): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }

  private handleClose(connection: number, code: number): void {
    if (connection !== this.connection) return;
    this.socket = undefined;
    const queues = this.queues;
    this.closeQueues(false, Boolean(this.pendingConnect));
    if (this.pendingConnect) {
      const error = new Error(`Voice Agent gateway closed (${code})`);
      this.pendingConnect.reject(error);
      this.pendingConnect = undefined;
      this.setState("error");
      if (queues) {
        queues.output.push({ type: "error", error });
        queues.output.close();
      } else {
        this.options.onError?.(error);
      }
    } else if (this.currentState !== "destroyed" && this.currentState !== "error") {
      this.setState("idle");
    }
  }

  private fail(connection: number, error: Error): void {
    if (connection !== this.connection) return;
    this.connection += 1;
    const socket = this.socket;
    this.socket = undefined;
    const queues = this.queues;
    this.closeQueues(false, true);
    this.pendingConnect?.reject(error);
    this.pendingConnect = undefined;
    socket?.close();
    this.setState("error");
    if (queues) {
      queues.output.push({ type: "error", error });
      queues.output.close();
    } else {
      this.options.onError?.(error);
    }
  }

  private stopLoops(socket: WebSocket, queues: RuntimeQueues): void {
    queues.ingress.close(true);
    queues.input.close(true);
    queues.backend.close(true);
    queues.output.close();
    if (socket.readyState === WebSocket.OPEN) socket.close(1011, "Voice Agent runtime error");
  }

  private closeQueues(discard = false, keepOutput = false): void {
    this.queues?.ingress.close(discard);
    this.queues?.input.close(discard);
    this.queues?.backend.close(discard);
    if (!keepOutput) this.queues?.output.close(discard);
    this.queues = undefined;
  }

  private setState(state: VuiState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onStateChange?.(state);
  }

  private assertActive(): void {
    if (this.currentState === "destroyed") throw new Error("VuiRuntime has been destroyed");
  }

  private asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
