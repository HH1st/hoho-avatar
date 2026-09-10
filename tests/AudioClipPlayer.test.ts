import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioClipPlayer } from "../src/audio-source/AudioClipPlayer";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

class FakeSource {
  buffer?: AudioBuffer;
  onended: (() => void) | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeWorkletNode {
  readonly port = { close: vi.fn(), onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeAudioContext {
  readonly audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly decodeAudioData = vi.fn().mockResolvedValue({ duration: 2, numberOfChannels: 1, sampleRate: 48000 });
  readonly resume = vi.fn<() => Promise<void>>();
  currentTime = 0;

  constructor(resumePromise: Promise<void>) {
    this.resume.mockReturnValue(resumePromise);
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

describe("AudioClipPlayer", () => {
  let context: FakeAudioContext;
  let resume: ReturnType<typeof deferred<void>>;

  beforeEach(() => {
    resume = deferred<void>();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          context = new FakeAudioContext(resume.promise);
          return context;
        }
      },
    );
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares one startup operation between concurrent play calls", async () => {
    const player = new AudioClipPlayer({ onPCM: vi.fn() });
    await player.load(new ArrayBuffer(1));

    const firstPlay = player.play();
    const secondPlay = player.play();
    expect(player.state).toBe("playing");

    resume.resolve();
    await Promise.all([firstPlay, secondPlay]);

    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.start).toHaveBeenCalledOnce();
    player.stop();
    expect(context.sources[0]?.stop).toHaveBeenCalledOnce();
    expect(player.state).toBe("ready");
  });

  it("cancels playback when stopped during startup", async () => {
    const player = new AudioClipPlayer({ onPCM: vi.fn() });
    await player.load(new ArrayBuffer(1));

    const playback = player.play();
    player.stop();
    resume.resolve();

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(context.sources).toHaveLength(0);
    expect(player.state).toBe("ready");
  });

  it('settles preparation immediately on destroy while a module download is pending', async () => {
    const player = new AudioClipPlayer({ onPCM: vi.fn() });
    const module = deferred<void>();
    context.audioWorklet.addModule.mockReturnValue(module.promise);
    const pending = player.prepare();
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await player.destroy();
    await rejected;
    module.reject(new Error('late network failure'));
    resume.resolve();
    expect(context.sources).toHaveLength(0);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('cancels a pending decode and accepts a new file without waiting for the old decode', async () => {
    const player = new AudioClipPlayer({ onPCM: vi.fn() });
    const decode = deferred<AudioBuffer>();
    context.decodeAudioData.mockReturnValueOnce(decode.promise);
    const pending = player.load(new ArrayBuffer(1));
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    player.stop(); await rejected;
    expect(player.state).toBe('empty');
    await player.load(new ArrayBuffer(2));
    expect(player.state).toBe('ready');
    decode.resolve({ duration: 99, sampleRate: 1000, numberOfChannels: 1 } as AudioBuffer);
    resume.resolve(); await player.play();
    expect(context.sources[0]?.buffer?.duration).toBe(2);
    await player.destroy();
  });
});
