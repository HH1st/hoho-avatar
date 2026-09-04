import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "./pcm";
import type { VuiClientOptions, VuiSessionOptions, VuiState } from "./types";

interface ServerEvent {
  type?: string;
  audio?: string;
  delta?: string;
  message?: string;
}

/** Thin browser adapter for the backend VUI runtime. */
export class VuiClient {
  private socket?: WebSocket;
  private currentState: VuiState = "idle";
  private connectPromise?: Promise<void>;

  constructor(private readonly options: VuiClientOptions) {}

  get state(): VuiState {
    return this.currentState;
  }

  connect(session: VuiSessionOptions = {}): Promise<void> {
    this.assertActive();
    if (this.currentState === "connected") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.setState("connecting");

    let socket: WebSocket;
    const operation = new Promise<void>((resolve, reject) => {
      socket = new WebSocket(this.options.gatewayUrl);
      this.socket = socket;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (this.socket === socket) this.socket = undefined;
        this.setState("error");
        this.options.onError?.(error);
        reject(error);
      };

      socket.onerror = () => fail(new Error("Unable to connect to the VUI gateway"));
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        if (!settled) fail(new Error(`VUI gateway closed (${event.code})`));
        else if (this.currentState !== "destroyed" && this.currentState !== "error") this.setState("idle");
      };
      socket.onmessage = (message) => {
        let event: ServerEvent;
        try { event = JSON.parse(String(message.data)) as ServerEvent; } catch { return; }
        if (event.type === "gateway.ready") {
          this.send({ type: "session.configure", ...session });
          return;
        }
        if (event.type === "session.ready") {
          if (!settled) {
            settled = true;
            this.setState("connected");
            resolve();
          }
          return;
        }
        if (event.type === "error") {
          const error = new Error(event.message ?? "VUI request failed");
          if (!settled) fail(error);
          else {
            this.setState("error");
            this.options.onError?.(error);
          }
          return;
        }
        this.deliver(event);
      };
    });
    const tracked = operation.finally(() => {
      if (this.connectPromise === tracked) this.connectPromise = undefined;
    });
    this.connectPromise = tracked;
    return tracked;
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
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "Client disconnected");
    if (this.currentState !== "destroyed") this.setState("idle");
  }

  destroy(): void {
    if (this.currentState === "destroyed") return;
    this.disconnect();
    this.setState("destroyed");
  }

  private deliver(event: ServerEvent): void {
    switch (event.type) {
      case "output.audio.delta":
        if (event.audio) this.options.onAudio?.(base64ToPCM16(event.audio));
        break;
      case "output.transcript.delta":
        if (event.delta) this.options.onTranscriptDelta?.(event.delta);
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
