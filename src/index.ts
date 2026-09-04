export { TalkingSprite } from "./core/TalkingSprite";
export { parseCharacterDefinition } from "./core/CharacterDefinition";
export { PCMAnalyzer } from "./audio/PCMAnalyzer";
export { MouthClassifier } from "./audio/MouthClassifier";
export { AudioClipPlayer } from "./audio-source/AudioClipPlayer";
export type { AudioClipMetadata, AudioClipPlayerOptions, AudioClipPlayerState } from "./audio-source/AudioClipPlayer";
export { AudioQueuePlayer } from "./audio-source/AudioQueuePlayer";
export type { AudioQueuePlayerOptions } from "./audio-source/AudioQueuePlayer";
export { StreamingTTSPlayer, takeTTSChunks } from "./audio-source/StreamingTTSPlayer";
export { VuiClient } from "./voice-agent/VuiClient";
export type { VuiClientOptions, VuiEvents, VuiSessionOptions, VuiState } from "./voice-agent/types";
export { StreamingPCMPlayer } from "./voice-agent/StreamingPCMPlayer";
export type { StreamingPCMPlayerOptions } from "./voice-agent/StreamingPCMPlayer";
export type {
  StreamingTTSPlayerOptions,
  StreamingTTSPlayerState,
  TTSChunkResult,
  TTSSynthesizer,
  TTSSynthesisOptions,
} from "./audio-source/StreamingTTSPlayer";
export type { AudioFeatures, CharacterDefinition, CharacterState, MotionFrame, MouthState, TalkingSpriteOptions } from "./core/types";
