import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "./pcm";
import type { VuiClientOptions, VuiSessionOptions, VuiState } from "./types";

interface ServerEvent {
  type: string;
  audio?: unknown;
  delta?: unknown;
  message?: unknown;
}

/** Thin browser adapter for the backend VUI runtime. */
export class VuiClient {
  private socket?: WebSocket;
  private currentState: VuiState = "idle";
  private connectPromise?: Promise<void>;
  private cancelConnect?: () => void;

  constructor(private readonly options: VuiClientOptions) {}

  get state(): VuiState {
    return this.currentState;
  }

  connect(session: VuiSessionOptions = {}): Promise<void> {
    this.assertActive();
    if (this.currentState === "connected") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    let resolveConnection!: () => void;
    let rejectConnection!: (error: Error) => void;
    const operation = new Promise<void>((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });
    this.connectPromise = operation;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (error?: Error) => {
      if (this.connectPromise !== operation) return;
      clearTimeout(timeout);
      this.connectPromise = undefined;
      this.cancelConnect = undefined;
      if (error) rejectConnection(error);
      else resolveConnection();
    };
    this.cancelConnect = () => settle(new DOMException("VUI connection was cancelled", "AbortError"));

    let socket: WebSocket | undefined;
    const fail = (error: Error) => {
      if (this.socket !== socket) return;
      this.releaseSocket();
      settle(error);
      this.setState("error");
      this.options.onError?.(error);
    };

    try {
      socket = new WebSocket(this.options.gatewayUrl);
      this.socket = socket;
      timeout = setTimeout(() => fail(new Error("VUI connection timed out. Please retry.")), this.options.connectTimeoutMs ?? 30_000);
      socket.onerror = () => fail(new Error("Unable to connect to the VUI gateway"));
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        if (this.connectPromise === operation) fail(new Error(`VUI gateway closed (${event.code})`));
        else {
          this.releaseSocket();
          this.setState("idle");
        }
      };
      socket.onmessage = (message) => {
        if (this.socket !== socket) return;
        let parsed: unknown;
        try { parsed = JSON.parse(String(message.data)); } catch { return; }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
          || !("type" in parsed) || typeof parsed.type !== "string") return;
        const event = parsed as ServerEvent;
        if (event.type === "gateway.ready") {
          this.send({ type: "session.configure", ...session });
          return;
        }
        if (event.type === "session.ready") {
          if (this.connectPromise === operation) {
            settle();
            this.setState("connected");
          }
          return;
        }
        if (event.type === "error" || event.type === "gateway.error") {
          fail(new Error(typeof event.message === "string" ? event.message : "VUI request failed"));
          return;
        }
        if (this.currentState === "connected") this.deliver(event);
      };
      this.setState("connecting");
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Unable to create the VUI connection"));
    }
    return operation;
  }

  sendAudio(chunk: Float32Array, sampleRate: number): void {
    if (this.currentState !== "connected") return;
    const audio = pcm16ToBase64(resampleFloat32ToPCM16(chunk, sampleRate));
    this.send({ type: "input.audio", audio });
  }

  sendText(text: string): void {
    if (this.currentState !== "connected" || !text.trim()) return;
    this.send({ type: "input.text", text });
  }

  interrupt(): void {
    if (this.currentState === "connected") this.send({ type: "interrupt" });
  }

  disconnect(): void {
    this.cancelConnect?.();
    this.releaseSocket();
    if (this.currentState !== "destroyed") this.setState("idle");
  }

  private releaseSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "Client disconnected");
    }
  }

  destroy(): void {
    if (this.currentState === "destroyed") return;
    this.disconnect();
    this.setState("destroyed");
  }

  private deliver(event: ServerEvent): void {
    switch (event.type) {
      case "output.audio.delta": {
        if (typeof event.audio !== "string" || !event.audio) return;
        let pcm: Int16Array;
        try { pcm = base64ToPCM16(event.audio); } catch { return; }
        this.options.onAudio?.(pcm);
        break;
      }
      case "output.transcript.delta":
        if (typeof event.delta === "string" && event.delta) this.options.onTranscriptDelta?.(event.delta);
        break;
      case "input.speech.started": this.options.onUserSpeechStart?.(); break;
      case "input.speech.stopped": this.options.onUserSpeechEnd?.(); break;
      case "response.started": this.options.onResponseStart?.(); break;
      case "response.done": this.options.onResponseEnd?.(); break;
      case "output.interrupted": this.options.onOutputInterrupted?.(); break;
    }
  }

  private send(event: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private setState(state: VuiState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onStateChange?.(state);
  }

  private assertActive(): void {
    if (this.currentState === "destroyed") throw new Error("VuiClient has been destroyed");
  }
}
