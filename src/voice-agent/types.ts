export type VuiState = "idle" | "connecting" | "connected" | "error" | "destroyed";

export interface VuiSessionOptions {
  instructions?: string;
  voice?: string;
}

export interface VuiEvents {
  onAudio?: (pcm: Int16Array) => void;
  onTranscriptDelta?: (delta: string) => void;
  onUserSpeechStart?: () => void;
  onUserSpeechEnd?: () => void;
  onResponseStart?: () => void;
  onResponseEnd?: () => void;
  onOutputInterrupted?: () => void;
  onStateChange?: (state: VuiState) => void;
  onError?: (error: Error) => void;
}

export interface VuiClientOptions extends VuiEvents {
  gatewayUrl: string;
}
