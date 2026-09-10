/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar, createAvatar } from '../src/core/Avatar';
import { canvasRenderer } from '../src/canvas';
import { threeRenderer } from '../src/three';
import type { RendererFactory } from '../src/core/renderer';
import type { CharacterDefinition } from '../src/core/types';
import { MOUTH_STATES } from '../src/core/MouthState';

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
const character: CharacterDefinition = {
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
    avatar.setState('thinking'); expect(avatar.getState()).toBe('thinking');
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
});
