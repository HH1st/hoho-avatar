import type { Container, Renderer, Texture } from 'pixi.js';
import type { Cubism4InternalModel, Live2DModel } from 'pixi-live2d-display/cubism4';
import type { Live2DParameterModel } from '../parameters';
import type { Live2DRuntime, Live2DRuntimeOptions } from './Runtime';
import { loadCubismCore } from './CubismCore';
import { loadLive2DAssets, type Live2DAssets } from './CubismAssets';
import { waitFor } from '../../internal/abort';

/** Version-specific bridge for pixi-live2d-display 0.4 / Pixi 6 / Cubism 3-4.
 * All internalModel access, event ordering, URL workarounds and teardown live here.
 */
class CubismRuntime implements Live2DRuntime {
  private renderer?: Renderer;
  private stage?: Container;
  private model?: Live2DModel<Cubism4InternalModel>;
  private pendingModel?: Live2DModel<Cubism4InternalModel>;
  private modelLoading?: Promise<void>;
  private parameterPort?: Live2DParameterModel;
  private assets?: Live2DAssets;
  private readonly textures = new Set<Texture>();
  private readonly releasedModels = new WeakSet<object>();
  private readonly lifetime = new AbortController();
  private disposed = false;
  private applyParameters?: () => void;
  private readonly beforeUpdate = () => this.applyParameters?.();

  get parameters(): Live2DParameterModel {
    if (!this.parameterPort) throw new Error('Live2D runtime is not ready');
    return this.parameterPort;
  }

  get size(): { width: number; height: number } {
    return { width: this.model?.internalModel.width ?? 0, height: this.model?.internalModel.height ?? 0 };
  }

  async load(canvas: HTMLCanvasElement, options: Live2DRuntimeOptions): Promise<void> {
    const signal = AbortSignal.any([options.signal, this.lifetime.signal]);
    const abort = () => this.destroy();
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await loadCubismCore(options.coreUrl, signal);
      const [pixi, cubism, csp] = await waitFor(Promise.all([
        import('pixi.js'), import('pixi-live2d-display/cubism4'), import('@pixi/unsafe-eval'),
      ]), signal);
      signal.throwIfAborted();
      csp.install(pixi);
      const assets = await loadLive2DAssets(options.model, signal);
      if (signal.aborted) { assets.dispose(); signal.throwIfAborted(); }
      this.assets = assets;
      // Adopt textures in the promise callback, so cancellation between decode
      // and the awaiting continuation cannot orphan a late texture.
      for (const url of assets.settings.FileReferences.Textures) {
        const pending = pixi.Texture.fromURL(url).then((texture) => {
          if (this.disposed) texture.destroy(true);
          else this.textures.add(texture);
          return texture;
        });
        await waitFor(pending, signal);
        signal.throwIfAborted();
      }
      this.renderer = new pixi.Renderer({ view: canvas, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2) });
      this.stage = new pixi.Container();
      const modelOptions = { autoUpdate: false, autoInteract: false, motionPreload: cubism.MotionPreloadStrategy.NONE };
      const model = new cubism.Live2DModel<Cubism4InternalModel>(modelOptions);
      this.pendingModel = model;
      const settings = new cubism.Cubism4ModelSettings(assets.settings);
      // Legacy url.resolve corrupts blob:http URLs. Assets are already resolved.
      settings.resolveURL = (path: string) => path;
      this.modelLoading = cubism.Live2DFactory.setupLive2DModel(model, settings, modelOptions);
      await waitFor(this.modelLoading, signal);
      signal.throwIfAborted();
      this.pendingModel = undefined;
      this.modelLoading = undefined;
      this.model = model;
      const internal = model.internalModel;
      const core = internal.coreModel;
      this.parameterPort = {
        getParameterIndex: (id) => {
          const index = core.getParameterIndex(id);
          // Cubism creates virtual indices for unknown IDs. Hide them here.
          return index >= 0 && index < core.getParameterCount() ? index : -1;
        },
        getParameterCount: () => core.getParameterCount(),
        getParameterMinimumValue: (index) => core.getParameterMinimumValue(index),
        getParameterMaximumValue: (index) => core.getParameterMaximumValue(index),
        getParameterDefaultValue: (index) => core.getParameterDefaultValue(index),
        setParameterValueByIndex: (index, value) => core.setParameterValueByIndex(index, value),
      };
      internal.eyeBlink = undefined;
      internal.lipSync = false;
      internal.on('beforeModelUpdate', this.beforeUpdate);
      model.anchor.set(0.5, 0.5);
      this.stage.addChild(model);
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  draw(deltaSeconds: number, applyParameters: () => void): void {
    if (this.disposed || !this.model || !this.stage || !this.renderer) return;
    this.applyParameters = applyParameters;
    try {
      // This wrapper accumulates milliseconds; the real update happens in draw.
      this.model.update(Math.max(0.01, Math.min(deltaSeconds, 0.1) * 1000));
      this.renderer.render(this.stage);
    } finally {
      this.applyParameters = undefined;
    }
  }

  fit(width: number, height: number, scale: number): void {
    if (this.disposed || !this.model || !this.renderer) return;
    this.renderer.resize(width, height);
    this.model.scale.set(scale);
    this.model.position.set(width / 2, height / 2);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.applyParameters = undefined;
    const pending = this.pendingModel;
    if (pending) {
      // Abort library-owned XHRs, then wait for assignment to finish before
      // disposing partial models. All version-specific cleanup stays in here.
      pending.emit('destroy');
      pending.internalModel?.emit('destroy');
      if (this.modelLoading) {
        void this.modelLoading.catch(() => {}).then(() => this.releaseModel(pending)).catch(console.error);
      } else this.releaseModel(pending);
      this.pendingModel = undefined;
    }
    if (this.model) this.releaseModel(this.model);
    this.model = undefined;
    this.parameterPort = undefined;
    this.stage?.destroy(); this.stage = undefined;
    this.renderer?.destroy(false); this.renderer = undefined;
    for (const texture of this.textures) texture.destroy(true);
    this.textures.clear();
    this.assets?.dispose(); this.assets = undefined;
  }

  private releaseModel(model: Live2DModel<Cubism4InternalModel>): void {
    if (this.releasedModels.has(model) || model.destroyed) return;
    this.releasedModels.add(model);
    if (model.internalModel) {
      model.internalModel.off('beforeModelUpdate', this.beforeUpdate);
      model.destroy({ children: true, texture: false, baseTexture: false });
    } else { model.emit('destroy'); model.removeAllListeners(); }
  }
}

export async function loadCubismRuntime(canvas: HTMLCanvasElement, options: Live2DRuntimeOptions): Promise<Live2DRuntime> {
  const runtime = new CubismRuntime();
  await runtime.load(canvas, options);
  return runtime;
}
