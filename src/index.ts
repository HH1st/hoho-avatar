export { TalkingSprite } from "./core/TalkingSprite";
export { PCMAnalyzer } from "./audio/PCMAnalyzer";
export { MouthClassifier } from "./audio/MouthClassifier";
export { AudioClipPlayer } from "./audio-source/AudioClipPlayer";
export type { AudioClipMetadata, AudioClipPlayerOptions, AudioClipPlayerState } from "./audio-source/AudioClipPlayer";
export { AudioQueuePlayer } from "./audio-source/AudioQueuePlayer";
export type { AudioQueuePlayerOptions } from "./audio-source/AudioQueuePlayer";
export { StreamingTTSPlayer, takeTTSChunks } from "./audio-source/StreamingTTSPlayer";
export type {
  StreamingTTSPlayerOptions,
  StreamingTTSPlayerState,
  TTSChunkResult,
  TTSSynthesizer,
  TTSSynthesisOptions,
} from "./audio-source/StreamingTTSPlayer";
export type { AudioFeatures, CharacterDefinition, CharacterState, MotionFrame, MouthState, TalkingSpriteOptions } from "./core/types";
