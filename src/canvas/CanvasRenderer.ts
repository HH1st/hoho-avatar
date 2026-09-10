import type { AvatarRenderer, RendererCapabilities, RenderFrame } from '../core/renderer';
import type { SpriteCharacterDefinition } from './SpriteCharacterDefinition';
import { MouthState, MOUTH_STATES } from '../core/MouthState';
import { loadSpriteCharacter } from './SpriteAssetLoader';
import { SpritePainter } from './SpritePainter';

export interface CanvasRendererOptions { character: string | SpriteCharacterDefinition; }

/** Canvas implementation of the same renderer contract used by Three.js. */
export class CanvasRenderer implements AvatarRenderer {
  readonly ready: Promise<void>;
  private drawing?: SpritePainter;
  private disposed = false;
  private readonly loading = new AbortController();
  private features: RendererCapabilities = { mouth: [], blink: false, viewControl: false };
  get capabilities(): RendererCapabilities { return this.features; }

  constructor(private readonly canvas: HTMLCanvasElement, options: CanvasRendererOptions) {
    this.ready = loadSpriteCharacter(options.character, this.loading.signal).then((character) => {
      this.loading.signal.throwIfAborted();
      this.drawing = new SpritePainter(canvas, character);
      this.features = { mouth: MOUTH_STATES, blink: Boolean(character.eyes), viewControl: false };
      this.reset();
    }).catch((error) => { this.destroy(); throw error; });
  }
  render(frame: Readonly<RenderFrame>): void { if (!this.disposed) this.drawing?.render(frame.motion, frame.eyesClosed); }
  reset(): void {
    if (!this.disposed) this.drawing?.render({ timestamp: 0, energy: 0, speaking: false, mouth: MouthState.Closed }, false);
  }
  // Canvas uses its character's logical resolution and CSS display size.
  resize(): void {}
  resetView(): void {}
  setViewControlEnabled(_enabled: boolean): void {}
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.loading.abort();
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawing = undefined;
  }
}
