import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioQueuePlayer } from "../src/audio-source/AudioQueuePlayer";

class FakeSource {
  buffer?: AudioBuffer;
  onended: (() => void) | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeWorkletNode {
  readonly port = { close: vi.fn(), onmessage: null };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeAudioContext {
  readonly audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly resume = vi.fn().mockResolvedValue(undefined);
  readonly decodedInputs: number[] = [];
  currentTime = 0;

  async decodeAudioData(input: ArrayBuffer): Promise<AudioBuffer> {
    const id = new Uint8Array(input)[0] ?? 0;
    this.decodedInputs.push(id);
    return { duration: id, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

describe("AudioQueuePlayer", () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    vi.stubGlobal("AudioContext", class {
      constructor() {
        context = new FakeAudioContext();
        return context;
      }
    });
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preserves append order and starts playback once", async () => {
    const onPlaybackStart = vi.fn();
    const player = new AudioQueuePlayer({ onPCM: vi.fn(), onPlaybackStart });

    await Promise.all([
      player.append(new Uint8Array([2]).buffer),
      player.append(new Uint8Array([1]).buffer),
    ]);

    expect(context.decodedInputs).toEqual([2, 1]);
    expect(context.sources.map((source) => source.start.mock.calls[0]?.[0])).toEqual([0.02, 2.02]);
    expect(onPlaybackStart).toHaveBeenCalledOnce();
    await player.destroy();
  });
});

