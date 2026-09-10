import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionController } from '../src/core/MotionController';
import type { AvatarRenderer } from '../src/core/renderer';
import { CharacterState, CHARACTER_STATES } from '../src/core/CharacterState';

function setup() {
  let tick!: (now: number) => void;
  vi.stubGlobal('requestAnimationFrame', vi.fn((draw) => { tick = draw; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const renderer = { ready: Promise.resolve(), capabilities: { mouth: [], blink: false, viewControl: false },
    render: vi.fn(), reset: vi.fn(), resize: vi.fn(), resetView: vi.fn(), setViewControlEnabled: vi.fn(), destroy: vi.fn() } satisfies AvatarRenderer;
  const controller = new MotionController(renderer);
  return { renderer, controller, tick: (time: number) => tick(time) };
}
describe('shared motion controller', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('reports a failed frame, stops scheduling and permits a clean restart', async () => {
    const { renderer, tick } = setup();
    const onError = vi.fn();
    const controller = new MotionController(renderer, 48_000, onError);
    await controller.ready;
    const error = new Error('render failed');
    renderer.render.mockImplementationOnce(() => { throw error; });
    controller.start();
    tick(performance.now());
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    controller.start();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    tick(performance.now());
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    controller.destroy();
  });
  it('delivers the same audio, state, blink and preview contract to any renderer', async () => {
    const { controller, renderer, tick } = setup();
    await controller.ready;
    controller.setState(CharacterState.Listening);
    controller.pushPCM(new Float32Array(1440).fill(0.3));
    expect(controller.getMotionFrame().mouth).toBe('large');
    controller.previewMouth('round'); controller.previewBlink(true); controller.start();
    expect(() => controller.previewMouth('unknown' as never)).toThrow('Unknown mouth state');
    tick(performance.now() + 20);
    expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({
      motion: expect.objectContaining({ mouth: 'round' }), eyesClosed: true, state: 'listening',
    }));
    controller.pushPCM(new Float32Array(1440).fill(0.3));
    tick(performance.now() + 40);
    expect(renderer.render.mock.calls.at(-1)![0].motion.mouth).toBe('large');
    controller.resetAudio();
    expect(controller.getMotionFrame().mouth).toBe('closed');
    expect(renderer.reset).toHaveBeenCalledOnce();
    controller.destroy();
  });
  it('does not reschedule if a renderer stops or destroys it during a frame', async () => {
    const { controller, renderer, tick } = setup();
    await controller.ready;
    renderer.render.mockImplementation(() => controller.stop());
    controller.start(); controller.start(); tick(performance.now());
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    renderer.render.mockImplementation(() => controller.destroy());
    controller.start(); tick(performance.now());
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(renderer.destroy).toHaveBeenCalledOnce();
    controller.destroy();
    expect(renderer.destroy).toHaveBeenCalledOnce();
  });
  it('resets partial PCM and motion on rate changes, but preserves them for the same rate', async () => {
    const { controller } = setup();
    await controller.ready;
    const onMotion = vi.fn(); controller.onMotion(onMotion);
    controller.pushPCM(new Float32Array(1000));
    controller.setSampleRate(48_000);
    expect(onMotion).not.toHaveBeenCalled();
    controller.setSampleRate(24_000);
    controller.pushPCM(new Float32Array(719));
    expect(onMotion).toHaveBeenCalledOnce();
    controller.pushPCM(new Float32Array(1));
    expect(onMotion).toHaveBeenCalledTimes(2);
    for (const rate of [NaN, Infinity, 0, -1]) expect(() => controller.setSampleRate(rate)).toThrow('finite');
    controller.destroy();
  });

  it('passes every shared state to the renderer and rejects invalid values without changing state', async () => {
    const { controller, renderer, tick } = setup();
    await controller.ready;
    expect(controller.getState()).toBe(CharacterState.Idle);
    controller.start();
    for (const state of CHARACTER_STATES) {
      controller.setState(state);
      tick(performance.now() + 20);
      expect(controller.getState()).toBe(state);
      expect(renderer.render.mock.calls.at(-1)![0].state).toBe(state);
    }
    for (const invalid of ['connecting', 'error', null, undefined, 42]) {
      expect(() => controller.setState(invalid as never)).toThrow('Unknown character state');
      expect(controller.getState()).toBe(CharacterState.Speaking);
    }
    controller.destroy();
  });
});
