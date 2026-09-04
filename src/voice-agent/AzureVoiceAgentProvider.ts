import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "./pcm";
import type { VoiceAgentProvider, VoiceAgentProviderEvents, VoiceAgentSessionOptions, VoiceAgentState } from "./VoiceAgentProvider";

export interface AzureVoiceAgentProviderOptions extends VoiceAgentProviderEvents {
  gatewayUrl: string;
}

interface RealtimeEvent {
  type?: string;
  delta?: string;
  error?: { message?: string };
  message?: string;
}

export class AzureVoiceAgentProvider implements VoiceAgentProvider {
  private socket?: WebSocket;
  private currentState: VoiceAgentState = "idle";
  private connectPromise?: Promise<void>;
  private pendingConnect?: { resolve: () => void; reject: (error: Error) => void };

  constructor(private readonly options: AzureVoiceAgentProviderOptions) {}

  get state(): VoiceAgentState {
    return this.currentState;
  }

  connect(sessionOptions: VoiceAgentSessionOptions = {}): Promise<void> {
    this.assertActive();
    if (this.currentState === "connected") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.setState("connecting");
    const operation = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.options.gatewayUrl);
      this.socket = socket;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (this.socket === socket) this.socket = undefined;
        this.setState("error");
        this.options.onError?.(error);
        this.pendingConnect = undefined;
        reject(error);
      };
      socket.onerror = () => fail(new Error("Unable to connect to the Voice Agent gateway"));
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        if (this.currentState === "connecting") fail(new Error(`Voice Agent gateway closed (${event.code})`));
        else if (this.currentState !== "destroyed") this.setState("idle");
      };
      socket.onmessage = (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(message.data)) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.type === "gateway.ready") {
          socket.send(JSON.stringify(this.sessionUpdate(sessionOptions)));
          this.pendingConnect = {
            resolve: () => {
              if (settled) return;
              settled = true;
              this.pendingConnect = undefined;
              this.setState("connected");
              resolve();
            },
            reject: fail,
          };
          return;
        }
        this.handleEvent(event);
      };
    });
    const tracked = operation.finally(() => {
      if (this.connectPromise === tracked) this.connectPromise = undefined;
    });
    this.connectPromise = tracked;
    return tracked;
  }

  sendAudio(chunk: Float32Array, sampleRate: number): void {
    if (this.currentState !== "connected" || this.socket?.readyState !== WebSocket.OPEN) return;
    const audio = pcm16ToBase64(resampleFloat32ToPCM16(chunk, sampleRate));
    this.socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
  }

  interrupt(): void {
    if (this.currentState !== "connected" || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "response.cancel" }));
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

  private sessionUpdate(options: VoiceAgentSessionOptions): object {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: options.instructions ?? "You are a concise, friendly voice companion. Respond naturally and briefly.",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24_000 },
            turn_detection: { type: "server_vad", create_response: true, interrupt_response: true },
          },
          output: { format: { type: "audio/pcm", rate: 24_000 }, voice: options.voice ?? "cedar" },
        },
      },
    };
  }

  private handleEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case "session.updated":
        this.pendingConnect?.resolve();
        break;
      case "response.output_audio.delta":
        if (event.delta) this.options.onAudio?.(base64ToPCM16(event.delta));
        break;
      case "response.output_audio_transcript.delta":
        if (event.delta) this.options.onTranscriptDelta?.(event.delta);
        break;
      case "input_audio_buffer.speech_started":
        this.options.onUserSpeechStart?.();
        break;
      case "input_audio_buffer.speech_stopped":
        this.options.onUserSpeechEnd?.();
        break;
      case "response.created":
        this.options.onResponseStart?.();
        break;
      case "response.done":
        this.options.onResponseEnd?.();
        break;
      case "gateway.error":
      case "error": {
        const error = new Error(event.error?.message ?? event.message ?? "Voice Agent request failed");
        if (this.pendingConnect) this.pendingConnect.reject(error);
        else {
          this.setState("error");
          this.options.onError?.(error);
        }
        break;
      }
    }
  }

  private setState(state: VoiceAgentState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onStateChange?.(state);
  }

  private assertActive(): void {
    if (this.currentState === "destroyed") throw new Error("AzureVoiceAgentProvider has been destroyed");
  }
}
