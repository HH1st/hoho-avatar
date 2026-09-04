export type VuiState = "idle" | "connecting" | "connected" | "error" | "destroyed";

export interface VuiSessionOptions {
  instructions?: string;
  voice?: string;
}

export type VuiInput =
  | { type: "audio"; pcm: Float32Array; sampleRate: number }
  | { type: "text"; text: string }
  | { type: "interrupt" };

export interface VuiEvents {
  onAudio?: (pcm: Int16Array) => void | Promise<void>;
  onTranscriptDelta?: (delta: string) => void | Promise<void>;
  onUserSpeechStart?: () => void | Promise<void>;
  onUserSpeechEnd?: () => void | Promise<void>;
  onResponseStart?: () => void | Promise<void>;
  onResponseEnd?: () => void | Promise<void>;
  onOutputInterrupted?: () => void | Promise<void>;
  onStateChange?: (state: VuiState) => void;
  onError?: (error: Error) => void;
}

export interface VuiRuntimeOptions extends VuiEvents {
  gatewayUrl: string;
}
