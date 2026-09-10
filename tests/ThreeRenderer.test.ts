/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeRenderer } from '../src/three/ThreeRenderer';
import { MotionController } from '../src/core/MotionController';
import { WebGLRenderer } from 'three';

vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: vi.fn(class {
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio = vi.fn(); setSize = vi.fn(); render = vi.fn();
    dispose = vi.fn(); forceContextLoss = vi.fn();
  }) };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class {
  target = { set: vi.fn() }; update = vi.fn(); dispose = vi.fn();
} }));

const canvas = () => ({
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
  getBoundingClientRect: () => ({ width: 800, height: 600 }),
} as unknown as HTMLCanvasElement);

async function bytes() {
  const file = await readFile('public/models/mochi/mochi.glb');
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

describe('Three renderer lifecycle', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('loads the Blender rig, consumes PCM and releases animation and WebGL on destroy', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel);
    const view = new MotionController(new ThreeRenderer(canvas(), { model: await bytes() }));
    await view.ready;
    expect(view.capabilities.mouth).toHaveLength(5);
    const onMotion = vi.fn(); view.onMotion(onMotion);
    view.pushPCM(new Float32Array(1440).fill(0.3));
    expect(view.getMotionFrame().mouth).toBe('large');
    view.setSampleRate(24_000);
    expect(view.getMotionFrame().mouth).toBe('closed');
    view.start(); view.start();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    view.destroy(); view.destroy();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
    const renderer = vi.mocked(WebGLRenderer).mock.results[0]!.value;
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(() => view.pushPCM(new Float32Array())).toThrow('destroyed');
  });

  it('aborts a model fetch and never installs a renderer after disposal', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener('abort', () => reject(signal!.reason));
    })));
    const view = new MotionController(new ThreeRenderer(canvas(), { model: '/slow.glb' }));
    const rejected = expect(view.ready).rejects.toMatchObject({ name: 'AbortError' });
    view.destroy();
    await rejected;
    expect(signal!.aborted).toBe(true);
    expect(view.capabilities.mouth).toHaveLength(0);
  });

  it('cleans up a malformed model and rejects external resource references', async () => {
    const view = new MotionController(new ThreeRenderer(canvas(), { model: new ArrayBuffer(8) }));
    await expect(view.ready).rejects.toThrow('binary glTF');
    expect(vi.mocked(WebGLRenderer).mock.results[0]!.value.dispose).toHaveBeenCalledOnce();
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.test/private' }] }));
    const buffer = new ArrayBuffer(20 + json.length);
    const header = new DataView(buffer);
    header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true);
    header.setUint32(12, json.length, true); header.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20).set(json);
    const external = new MotionController(new ThreeRenderer(canvas(), { model: buffer }));
    await expect(external.ready).rejects.toThrow('self-contained');
  });
});
