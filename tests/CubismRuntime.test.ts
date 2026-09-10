import { afterEach, describe, expect, it, vi } from 'vitest';
import { Live2DRenderer } from '../src/live2d';
import { createAvatar, CharacterState, MouthState } from '../src';
import { live2dRenderer } from '../src/live2d';
import { loadCubismRuntime } from '../src/live2d/internal/CubismRuntime';

const fakes = vi.hoisted(() => ({
  loadCore: vi.fn().mockResolvedValue(undefined), loadAssets: vi.fn(), setup: vi.fn(),
  disposeAssets: vi.fn(), textureDestroy: vi.fn(), rendererDestroy: vi.fn(), updates: vi.fn(), parameters: [0, 0, 1, 1, 0],
  textureLoad: vi.fn(), modelDestroy: vi.fn(),
}));
vi.mock('../src/live2d/internal/CubismCore', () => ({ loadCubismCore: fakes.loadCore }));
vi.mock('../src/live2d/internal/CubismAssets', () => ({ loadLive2DAssets: fakes.loadAssets }));
vi.mock('@pixi/unsafe-eval', () => ({ install() {} }));
vi.mock('pixi.js', () => ({
  Renderer: class { resize() {} destroy = fakes.rendererDestroy; render(stage: any) { stage.child?.internalModel.emit('beforeModelUpdate'); } },
  Container: class { child: any; addChild(child: any) { this.child = child; } destroy() {} },
  Texture: { fromURL: fakes.textureLoad },
}));
vi.mock('pixi-live2d-display/cubism4', () => ({
  MotionPreloadStrategy: { NONE: 'NONE' },
  Cubism4ModelSettings: class { resolveURL(path: string) { return path; } },
  Live2DFactory: { setupLive2DModel: fakes.setup },
  Live2DModel: class {
    destroyed = false; textures = []; on() {} emit() {} removeAllListeners() {}
    anchor = { set() {} }; scale = { set() {} }; position = { set() {} };
    update = fakes.updates;
    internalModel = {
      width: 100, height: 200, eyeBlink: {}, lipSync: true,
      coreModel: {
        getParameterIndex: (id: string) => {
          const index = ['ParamMouthOpenY', 'ParamMouthForm', 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamAngleZ'].indexOf(id);
          return index < 0 ? 99 : index;
        },
        getParameterCount: () => 5, getParameterMinimumValue: () => -30, getParameterMaximumValue: () => 30,
        getParameterDefaultValue: (index: number) => index === 2 || index === 3 ? 1 : 0,
        setParameterValueByIndex: (index: number, value: number) => { fakes.parameters[index] = value; },
      },
      listener: undefined as (() => void) | undefined,
      on(_event: string, listener: () => void) { this.listener = listener; },
      off() { this.listener = undefined; },
      emit() { this.listener?.(); },
    };
    destroy() { this.destroyed = true; fakes.modelDestroy(); }
  },
}));
function canvas() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn(), getBoundingClientRect: () => ({ width: 400, height: 400 }) } as unknown as HTMLCanvasElement;
}
function setup() {
  fakes.textureLoad.mockResolvedValue({ destroy: fakes.textureDestroy });
  fakes.setup.mockResolvedValue(undefined);
  fakes.loadAssets.mockResolvedValue({ settings: { Version: 3, url: 'https://example.test/a.model3.json', FileReferences: { Moc: 'blob:moc', Textures: ['blob:tex'] } }, dispose: fakes.disposeAssets });
}
describe('Cubism runtime integration', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
  it('returns the shared Avatar and is advanced only by RenderFrame', async () => {
    setup(); let tick!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { tick = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const avatar = await createAvatar(canvas(), { renderer: live2dRenderer({ model: '/a.model3.json' }) });
    expect(avatar.constructor.name).toBe('Avatar');
    expect(fakes.setup.mock.calls[0]![2]).toEqual({ autoUpdate: false, autoInteract: false, motionPreload: 'NONE' });
    avatar.setState(CharacterState.Thinking); avatar.previewMouth(MouthState.Large); avatar.previewBlink(true);
    tick(performance.now() + 50);
    expect(fakes.updates).toHaveBeenCalledTimes(2); // initial frame plus the common controller
    expect(fakes.parameters[0]).toBeGreaterThan(0); expect(fakes.parameters[2]).toBe(0);
    await avatar.destroy(); await avatar.destroy();
    expect(fakes.rendererDestroy).toHaveBeenCalledOnce();
    expect(fakes.textureDestroy).toHaveBeenCalledOnce(); expect(fakes.disposeAssets).toHaveBeenCalledOnce();
  });
  it('releases partial resources after failed model setup', async () => {
    setup(); fakes.setup.mockRejectedValueOnce(new Error('bad moc'));
    const renderer = new Live2DRenderer(canvas(), { model: '/bad.model3.json' });
    await expect(renderer.ready).rejects.toThrow('bad moc');
    expect(fakes.rendererDestroy).toHaveBeenCalledOnce(); expect(fakes.textureDestroy).toHaveBeenCalledOnce();
    expect(fakes.disposeAssets).toHaveBeenCalledOnce();
  });
  it('rejects cancelled creation and disposes a late third-party model load', async () => {
    setup(); let release!: () => void;
    fakes.setup.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const renderer = new Live2DRenderer(canvas(), { model: '/slow.model3.json' });
    const rejected = expect(renderer.ready).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fakes.setup).toHaveBeenCalledOnce());
    renderer.destroy(); await rejected; release(); await Promise.resolve();
    expect(fakes.rendererDestroy).toHaveBeenCalledOnce(); expect(fakes.disposeAssets).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(fakes.modelDestroy).toHaveBeenCalledOnce());
  });
  it('hides virtual Cubism parameters and confines the blob URL workaround to the adapter', async () => {
    setup();
    const runtime = await loadCubismRuntime(canvas(), { model: '/a.model3.json', signal: new AbortController().signal });
    expect(runtime.parameters.getParameterIndex('absent')).toBe(-1);
    expect(runtime.parameters.getParameterIndex('ParamMouthOpenY')).toBe(0);
    expect(runtime.parameters).not.toHaveProperty('getModel');
    expect(runtime.size).toEqual({ width: 100, height: 200 });
    const settings = fakes.setup.mock.calls[0]![1];
    expect(settings.resolveURL('blob:http://local.test/asset')).toBe('blob:http://local.test/asset');
    const apply = vi.fn();
    runtime.draw(0.02, apply);
    expect(fakes.updates).toHaveBeenLastCalledWith(20);
    expect(apply).toHaveBeenCalledOnce();
    runtime.destroy(); runtime.draw(0.02, apply); runtime.destroy();
    expect(apply).toHaveBeenCalledOnce();
    expect(fakes.modelDestroy).toHaveBeenCalledOnce();
  });
  it('releases a texture that resolves after cancellation before model construction', async () => {
    setup();
    let resolve!: (value: { destroy: () => void }) => void;
    fakes.textureLoad.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
    const abort = new AbortController();
    const loading = loadCubismRuntime(canvas(), { model: '/a.model3.json', signal: abort.signal });
    const rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fakes.textureLoad).toHaveBeenCalledOnce());
    abort.abort(); await rejected;
    resolve({ destroy: fakes.textureDestroy });
    await vi.waitFor(() => expect(fakes.textureDestroy).toHaveBeenCalledOnce());
    expect(fakes.setup).not.toHaveBeenCalled();
    expect(fakes.disposeAssets).toHaveBeenCalledOnce();
  });
});
