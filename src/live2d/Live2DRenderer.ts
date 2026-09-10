import type { AvatarRenderer, RendererCapabilities, RendererContext, RenderFrame } from '../core/renderer';
import { CharacterState } from '../core/CharacterState';
import { MouthState } from '../core/MouthState';
import { loadCubismRuntime } from './internal/CubismRuntime';
import type { Live2DRuntime } from './internal/Runtime';
import { Live2DParameters, type Live2DParameterOptions } from './parameters';

export interface Live2DRendererOptions {
  model: string;
  /** Caller-hosted official Cubism Core script, or omit if already loaded. */
  coreUrl?: string;
  parameters?: Live2DParameterOptions;
  pixelRatio?: number;
  padding?: number;
}

/** Adapts shared frames and viewport controls to a private model runtime. */
export class Live2DRenderer implements AvatarRenderer {
  readonly ready: Promise<void>;
  private readonly lifetime = new AbortController();
  private runtime?: Live2DRuntime;
  private rig?: Live2DParameters;
  private observer?: ResizeObserver;
  private disposed = false;
  private zoom = 1;
  private viewControl = true;
  private frame: RenderFrame = { motion: { timestamp: 0, mouth: MouthState.Closed, energy: 0, speaking: false },
    state: CharacterState.Idle, eyesClosed: false, timestamp: 0, deltaSeconds: 0.1 };
  private readonly applyParameters = () => this.rig?.apply(this.frame);
  private readonly lost = (event: Event) => {
    event.preventDefault(); this.context?.onError(new Error('Live2D graphics context lost. Recreate the avatar to restore it.'));
  };
  private readonly wheel = (event: WheelEvent) => {
    if (!this.viewControl) return;
    event.preventDefault(); this.zoom = Math.min(2.5, Math.max(0.5, this.zoom * Math.exp(-event.deltaY * 0.001)));
    this.resize();
  };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: Live2DRendererOptions, private readonly context?: RendererContext) {
    if (options.pixelRatio !== undefined && (!Number.isFinite(options.pixelRatio) || options.pixelRatio <= 0)) throw new Error('pixelRatio must be positive and finite');
    if (options.padding !== undefined && (!Number.isFinite(options.padding) || options.padding < 0 || options.padding >= 0.5)) throw new Error('padding must be between 0 and 0.5');
    this.ready = this.load().catch((error) => { this.destroy(); throw error; });
  }
  get capabilities(): RendererCapabilities { return this.rig?.capabilities ?? { mouth: [], blink: false, viewControl: true }; }

  private async load(): Promise<void> {
    const signal = this.lifetime.signal;
    const runtime = await loadCubismRuntime(this.canvas, {
      model: this.options.model, coreUrl: this.options.coreUrl, pixelRatio: this.options.pixelRatio, signal,
    });
    if (signal.aborted) { runtime.destroy(); signal.throwIfAborted(); }
    this.runtime = runtime;
    this.rig = new Live2DParameters(runtime.parameters, this.options.parameters);
    this.resize(); this.render(this.frame);
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.canvas); }
    this.canvas.addEventListener('webglcontextlost', this.lost);
    this.canvas.addEventListener('wheel', this.wheel, { passive: false });
  }

  render(frame: Readonly<RenderFrame>): void {
    if (this.disposed || !this.runtime) return;
    this.frame = frame;
    this.runtime.draw(frame.deltaSeconds, this.applyParameters);
  }
  reset(): void {
    this.frame = { ...this.frame, motion: { ...this.frame.motion, mouth: MouthState.Closed, energy: 0, speaking: false }, eyesClosed: false, state: CharacterState.Idle };
    this.rig?.reset();
  }
  resize(): void {
    if (this.disposed || !this.runtime) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const size = this.runtime.size;
    if (width <= 0 || height <= 0 || size.width <= 0 || size.height <= 0) return;
    const scale = Math.min(width / size.width, height / size.height) * (1 - 2 * (this.options.padding ?? 0.08)) * this.zoom;
    this.runtime.fit(width, height, scale);
  }
  resetView(): void { this.zoom = 1; this.resize(); }
  setViewControlEnabled(enabled: boolean): void { this.viewControl = enabled; }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.lifetime.abort(); this.observer?.disconnect();
    this.canvas.removeEventListener('wheel', this.wheel); this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.runtime?.destroy(); this.runtime = undefined; this.rig = undefined;
  }
}
