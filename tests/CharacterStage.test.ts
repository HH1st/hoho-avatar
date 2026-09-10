import { afterEach, expect, it, vi } from 'vitest';
import { CharacterStage } from '../examples/basic/CharacterStage';
import { CharacterState } from '../src';
import type { AvatarRenderer } from '../src';

function setup() {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = { cloneNode: vi.fn(), replaceWith: vi.fn() };
  canvas.cloneNode.mockReturnValue(canvas);
  const mounted = vi.fn();
  const renderer: AvatarRenderer = {
    ready: Promise.resolve(), capabilities: { mouth: [], blink: false, viewControl: false },
    render: vi.fn(), reset: vi.fn(), resize: vi.fn(), resetView: vi.fn(), setViewControlEnabled: vi.fn(), destroy: vi.fn(),
  };
  const factory = vi.fn(() => renderer);
  const stage = new CharacterStage(canvas as unknown as HTMLCanvasElement, mounted, vi.fn());
  return { stage, mounted, renderer, factory, canvas };
}
afterEach(() => vi.unstubAllGlobals());
it('reuses a character for new audio and applies the latest rate/state', async () => {
  const { stage, factory, canvas, mounted } = setup();
  await stage.ensure('mochi', async () => factory, 48_000, CharacterState.Idle);
  const avatar = stage.avatar;
  await stage.ensure('mochi', async () => factory, 24_000, CharacterState.Listening);
  expect(stage.avatar).toBe(avatar); expect(factory).toHaveBeenCalledOnce();
  expect(canvas.cloneNode).toHaveBeenCalledOnce(); expect(mounted).toHaveBeenCalledOnce();
  expect(avatar!.getState()).toBe(CharacterState.Listening);
  stage.dispose();
});
it('cancels a waiting audio session without aborting the character load', async () => {
  const { stage, factory, renderer } = setup();
  let release!: () => void;
  Object.assign(renderer, { ready: new Promise<void>((resolve) => { release = resolve; }) });
  const initial = stage.ensure('mochi', async () => factory, 48_000, CharacterState.Idle);
  const abort = new AbortController();
  const waiting = stage.ensure('mochi', async () => factory, 24_000, CharacterState.Listening, abort.signal);
  const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort(); stage.setState(CharacterState.Idle); await rejected;
  release(); await initial;
  expect(factory).toHaveBeenCalledOnce(); expect(renderer.destroy).not.toHaveBeenCalled();
  expect(stage.avatar!.getState()).toBe(CharacterState.Idle);
  stage.dispose();
});
it('aborts and disposes a replaced load so it cannot overwrite the newer avatar', async () => {
  const { stage, renderer, factory } = setup();
  Object.assign(renderer, { ready: new Promise<void>(() => {}) });
  const old = stage.ensure('old', async () => factory, 48_000, CharacterState.Idle);
  const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
  const next = { ...renderer, ready: Promise.resolve(), destroy: vi.fn() };
  await stage.ensure('new', async () => () => next, 48_000, CharacterState.Thinking);
  await rejected;
  expect(renderer.destroy).toHaveBeenCalledOnce(); expect(stage.avatar!.getState()).toBe(CharacterState.Thinking);
  stage.dispose(); expect(next.destroy).toHaveBeenCalledOnce();
});
