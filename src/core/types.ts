import type { MouthState } from './MouthState';
export type { MouthState } from './MouthState';
export type CharacterState = "idle" | "listening" | "thinking" | "speaking";

export interface MotionFrame {
  timestamp: number;
  speaking: boolean;
  energy: number;
  mouth: MouthState;
}

export interface SpritePlacement {
  src: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CharacterDefinition {
  version: 1;
  canvas: { width: number; height: number };
  body: SpritePlacement;
  mouth: {
    anchor: { x: number; y: number };
    sprites: Record<MouthState, string>;
  };
  eyes?: {
    anchor: { x: number; y: number };
    sprites: { open: string; closed: string };
  };
  animation?: {
    bodyBouncePx?: number;
  };
}

export interface AudioFeatures {
  timestamp: number;
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  spectralCentroid: number;
  lowBandRatio: number;
}
