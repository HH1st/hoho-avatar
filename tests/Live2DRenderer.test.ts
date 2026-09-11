import { afterEach, describe, expect, it, vi } from 'vitest';
import { Live2DRenderer, live2dRenderer } from '../src/live2d';
import { createAvatar, CharacterState, MouthState } from '../src';
import type { Live2DRuntime } from '../src/live2d/internal/Runtime';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/live2d/internal/CubismRuntime', () => ({ loadCubismRuntime: mocks.load }));

function fixture() {
  const values = [0, 0, 1, 1, 0];
  const runtime: Live2DRuntime = {
    parameters: {
      getParameterIndex: (id) => ['ParamMouthOpenY', 'ParamMouthForm', 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamAngleZ'].indexOf(id),
      getParameterCount: () => 5, getParameterMinimumValue: () => -30, getParameterMaximumValue: () => 30,
      getParameterDefaultValue: (index) => index === 2 || index === 3 ? 1 : 0,
      setParameterValueByIndex: (index, value) => { values[index] = value; },
    },
    size: { width: 100, height: 200 },
    draw: vi.fn((_delta, apply) => apply()), fit: vi.fn(), destroy: vi.fn(),
  };
  const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ width: 400, height: 400 }),
  } as unknown as HTMLCanvasElement;
  mocks.load.mockResolvedValue(runtime);
  return { canvas, runtime, values };
}

describe('Live2D renderer through its engine-neutral runtime port', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('uses the common Avatar and drives parameters without knowing third-party model internals', async () => {
    const { canvas, runtime, values } = fixture();
    let tick!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { tick = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const avatar = await createAvatar(canvas, { renderer: live2dRenderer({ model: '/test.model3.json' }) });
    expect(avatar.constructor.name).toBe('Avatar');
    avatar.setState(CharacterState.Thinking); avatar.previewMouth(MouthState.Large); avatar.previewBlink(true);
    tick(performance.now() + 50);
    expect(values[0]).toBeGreaterThan(0); expect(values[2]).toBe(0); expect(values[4]).toBeGreaterThan(0);
    expect(runtime.draw).toHaveBeenCalledTimes(2);
    expect(runtime.fit).toHaveBeenLastCalledWith(400, 400, 1.68);
    const wheel = vi.mocked(canvas.addEventListener).mock.calls.find(([name]) => name === 'wheel')![1] as (event: object) => void;
    const preventDefault = vi.fn();
    avatar.setViewControlEnabled(false); wheel({ deltaY: -100, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    avatar.setViewControlEnabled(true); wheel({ deltaY: -100, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    avatar.resetView(); expect(runtime.fit).toHaveBeenLastCalledWith(400, 400, 1.68);
    await avatar.destroy(); await avatar.destroy();
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it('disposes an adapter which arrives after cancellation and never installs listeners', async () => {
    const { canvas, runtime } = fixture();
    let resolve!: (value: Live2DRuntime) => void;
    mocks.load.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
    const renderer = new Live2DRenderer(canvas, { model: '/slow.model3.json' });
    const rejected = expect(renderer.ready).rejects.toMatchObject({ name: 'AbortError' });
    renderer.destroy();
    expect(mocks.load.mock.calls[0]![1].signal.aborted).toBe(true);
    resolve(runtime); await rejected;
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(canvas.addEventListener).not.toHaveBeenCalled();
  });

  it('frames off-center artwork and restores that framing after wheel zoom', async () => {
    const { canvas, runtime } = fixture();
    const renderer = new Live2DRenderer(canvas, { model: '/sample.model3.json', padding: 0.1,
      viewBox: { x: 300, y: 400, width: 200, height: 400 } });
    await renderer.ready;
    expect(runtime.fit).toHaveBeenLastCalledWith(400, 400, 0.8, { x: 400, y: 600 });
    const wheel = vi.mocked(canvas.addEventListener).mock.calls.find(([name]) => name === 'wheel')![1] as (event: object) => void;
    wheel({ deltaY: -100, preventDefault() {} });
    expect(vi.mocked(runtime.fit).mock.lastCall![2]).toBeGreaterThan(0.8);
    renderer.resetView();
    expect(runtime.fit).toHaveBeenLastCalledWith(400, 400, 0.8, { x: 400, y: 600 });
    renderer.destroy();
  });

  it('rejects invalid framing before loading a runtime', () => {
    const { canvas } = fixture();
    for (const viewBox of [{ x: NaN, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 0, height: 100 },
      { x: 0, y: 0, width: 100, height: -1 }]) {
      expect(() => new Live2DRenderer(canvas, { model: '/sample.model3.json', viewBox })).toThrow('viewBox');
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('releases the runtime if parameter configuration fails after loading', async () => {
    const { canvas, runtime } = fixture();
    const renderer = new Live2DRenderer(canvas, { model: '/test.model3.json', parameters: { mouth: { large: { open: NaN, form: 0 } } } });
    await expect(renderer.ready).rejects.toThrow('finite');
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(canvas.addEventListener).not.toHaveBeenCalled();
  });
});
