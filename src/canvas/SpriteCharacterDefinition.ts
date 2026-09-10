import type { MouthState } from '../core/MouthState';

export interface SpritePlacement {
  src: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface SpriteCharacterDefinition {
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
