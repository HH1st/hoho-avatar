import type { Live2DParameterModel } from '../parameters';

/** Private engine port: no Pixi/Cubism types or events cross this boundary. */
export interface Live2DRuntime {
  readonly parameters: Live2DParameterModel;
  readonly size: { width: number; height: number };
  /** Apply parameters after simulation, immediately before the final model update/draw. */
  draw(deltaSeconds: number, applyParameters: () => void): void;
  fit(width: number, height: number, scale: number): void;
  destroy(): void;
}

export interface Live2DRuntimeOptions {
  model: string;
  coreUrl?: string;
  pixelRatio?: number;
  signal: AbortSignal;
}
