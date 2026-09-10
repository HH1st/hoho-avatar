import type { MouthState } from './MouthState';
export type { MouthState } from './MouthState';
export type { CharacterState } from './CharacterState';

export interface MotionFrame {
  timestamp: number;
  speaking: boolean;
  energy: number;
  mouth: MouthState;
}

export interface AudioFeatures {
  timestamp: number;
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  /** Zero-crossing-derived frequency estimate in Hz; not a spectral centroid. */
  estimatedFrequencyHz: number;
  /** Heuristic 0..1 score derived from zero crossings; not spectral band power. */
  roundnessScore: number;
}
