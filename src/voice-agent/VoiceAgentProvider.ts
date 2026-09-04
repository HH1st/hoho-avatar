export type VoiceAgentState = "idle" | "connecting" | "connected" | "error" | "destroyed";

export interface VoiceAgentSessionOptions {
  instructions?: string;
  voice?: string;
}

export interface VoiceAgentProviderEvents {
  onAudio?: (pcm: Int16Array) => void;
  onTranscriptDelta?: (delta: string) => void;
  onUserSpeechStart?: () => void;
  onUserSpeechEnd?: () => void;
  onResponseStart?: () => void;
  onResponseEnd?: () => void;
  onStateChange?: (state: VoiceAgentState) => void;
  onError?: (error: Error) => void;
}

export interface VoiceAgentProvider {
  readonly state: VoiceAgentState;
  connect(options?: VoiceAgentSessionOptions): Promise<void>;
  sendAudio(chunk: Float32Array, sampleRate: number): void;
  interrupt(): void;
  disconnect(): void;
  destroy(): void;
}

