import type { CharacterState, MotionFrame, MouthState } from './types';

/** All renderer implementations consume this engine-independent frame. */
export interface RenderFrame {
  motion: Readonly<MotionFrame>;
  eyesClosed: boolean;
  state: CharacterState;
  timestamp: number;
  deltaSeconds: number;
}

export interface RendererCapabilities {
  readonly mouth: readonly MouthState[];
  readonly blink: boolean;
  readonly viewControl: boolean;
}

/** Equal contract for Canvas, Three.js and application-provided renderers.
 * Optional visual features are reported through capabilities; their controls
 * remain callable and are no-ops when unsupported. destroy() is idempotent.
 */
export interface AvatarRenderer {
  readonly ready: Promise<void>;
  readonly capabilities: RendererCapabilities;
  render(frame: Readonly<RenderFrame>): void;
  reset(): void;
  resize(): void;
  resetView(): void;
  setViewControlEnabled(enabled: boolean): void;
  destroy(): void;
}

export interface RendererContext {
  /** Asynchronous rendering failures, such as loss of the graphics context. */
  onError(error: Error): void;
}

export type RendererFactory = (canvas: HTMLCanvasElement, context?: RendererContext) => AvatarRenderer;
