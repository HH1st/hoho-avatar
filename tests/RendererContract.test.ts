/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar, createAvatar } from '../src/core/Avatar';
import { canvasRenderer } from '../src/canvas';
import { threeRenderer } from '../src/three';
import type { RendererFactory } from '../src/core/renderer';
import type { SpriteCharacterDefinition } from '../src/canvas';
import { MOUTH_STATES } from '../src/core/MouthState';
import { CharacterState, CHARACTER_STATES } from '../src/core/CharacterState';

vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio() {} setSize() {} render() {} dispose() {} forceContextLoss() {}
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class {
  target = { set() {} }; update() {} dispose() {}
} }));
const character: SpriteCharacterDefinition = {
  version: 1, canvas: { width: 128, height: 128 }, body: { src: 'body.png' },
  mouth: { anchor: { x: 64, y: 70 }, sprites: { closed: 'c.png', small: 's.png', large: 'l.png', wide: 'w.png', round: 'r.png' } },
  eyes: { anchor: { x: 64, y: 30 }, sprites: { open: 'o.png', closed: 'b.png' } },
};

describe.each(['canvas', 'three'] as const)('%s implements the same Avatar contract', (kind) => {
  beforeEach(() => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/' });
    vi.stubGlobal('Image', class {
      width = 16; height = 16; onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  it('returns exactly Avatar and provides equal creation, motion, previews and disposal', async () => {
    const file = await readFile('public/models/mochi/mochi.glb');
    const factory: RendererFactory = kind === 'canvas' ? canvasRenderer({ character }) : threeRenderer({
      model: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
    });
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { getContext: () => context, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
    } as unknown as HTMLCanvasElement;
    const onMotion = vi.fn();
    const avatar = await createAvatar(canvas, { renderer: factory, onMotion });
    expect(avatar.constructor).toBe(Avatar);
    await avatar.ready;
    expect(avatar.capabilities.mouth).toEqual(MOUTH_STATES);
    expect(avatar.capabilities.blink).toBe(true);
    expect(avatar.capabilities.viewControl).toBe(kind === 'three');
    avatar.resize(); avatar.resetView(); avatar.setViewControlEnabled(false);
    expect(avatar.getState()).toBe(CharacterState.Idle);
    for (const state of CHARACTER_STATES) {
      avatar.setState(state); expect(avatar.getState()).toBe(state);
    }
    expect(() => avatar.setState('connecting' as never)).toThrow('Unknown character state');
    expect(avatar.getState()).toBe(CharacterState.Speaking);
    avatar.pushPCM(new Float32Array(1440).fill(0.3));
    expect(avatar.getMotionFrame().mouth).toBe('large');
    avatar.previewMouth('round'); avatar.previewBlink(true); avatar.resetAudio();
    expect(avatar.getMotionFrame().mouth).toBe('closed');
    expect(onMotion).toHaveBeenCalled();
    avatar.stop(); avatar.start();
    await avatar.destroy(); await avatar.destroy();
    expect(() => avatar.pushPCM(new Float32Array())).toThrow('destroyed');
    expect(() => avatar.resetView()).toThrow('destroyed');
  });
  it('routes asynchronous renderer errors through the common Avatar callback', async () => {
    const onError = vi.fn();
    let context: import('../src/core/renderer').RendererContext | undefined;
    const error = new Error('graphics context lost');
    const avatar = await createAvatar({} as HTMLCanvasElement, { onError, renderer: (_canvas, callbacks) => {
      context = callbacks;
      return { ready: Promise.resolve(), capabilities: { mouth: [], blink: false, viewControl: false },
        render() {}, reset() {}, resize() {}, resetView() {}, setViewControlEnabled() {}, destroy() {} };
    } });
    context!.onError(error);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    avatar.start();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    await avatar.destroy();
  });
});
