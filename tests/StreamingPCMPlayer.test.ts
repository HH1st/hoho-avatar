import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingPCMPlayer } from "../src/voice-agent/StreamingPCMPlayer";

class FakeBuffer {
  readonly channel: Float32Array;
  readonly duration: number;
  constructor(length: number, sampleRate: number) {
    this.channel = new Float32Array(length);
    this.duration = length / sampleRate;
  }
  getChannelData() { return this.channel; }
}

class FakeSource {
  buffer?: FakeBuffer;
  onended: (() => void) | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly resume = vi.fn().mockResolvedValue(undefined);
  readonly close = vi.fn().mockResolvedValue(undefined);
  createBuffer(_channels: number, length: number, sampleRate: number) { return new FakeBuffer(length, sampleRate); }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

class FakeWorkletNode {
  readonly port = { close: vi.fn(), postMessage: vi.fn(), onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

describe("StreamingPCMPlayer", () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("AudioContext", class {
      constructor() {
        context = new FakeAudioContext();
        return context;
      }
    });
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("emits avatar PCM only when the audio worklet renders it", async () => {
    const onPCM = vi.fn();
    const player = new StreamingPCMPlayer({ sampleRate: 1_000, onPCM });
    await player.prepare();
    expect(player.outputSampleRate).toBe(48_000);
    player.appendPCM16(new Int16Array(100));
    player.appendPCM16(new Int16Array(100));

    expect(context.sources[0]?.start.mock.calls[0]?.[0]).toBeCloseTo(0.02);
    expect(context.sources[1]?.start.mock.calls[0]?.[0]).toBeCloseTo(0.12);
    expect(onPCM).not.toHaveBeenCalled();
    const worklet = context.sources[0]?.connect.mock.calls[0]?.[0] as FakeWorkletNode;
    worklet.port.onmessage?.({ data: new Float32Array(480) } as MessageEvent<Float32Array>);
    expect(onPCM).toHaveBeenCalledTimes(1);
  });

  it("cancels queued audio when interrupted", async () => {
    const onPCM = vi.fn();
    const player = new StreamingPCMPlayer({ sampleRate: 1_000, onPCM });
    await player.prepare();
    player.appendPCM16(new Int16Array(100));
    player.interrupt();
    expect(onPCM).not.toHaveBeenCalled();
    expect(context.sources[0]?.stop).toHaveBeenCalledOnce();
  });

  it("resets motion only after the audible queue drains", async () => {
    const onPlaybackEnd = vi.fn();
    const player = new StreamingPCMPlayer({ sampleRate: 1_000, onPlaybackEnd });
    await player.prepare();
    player.appendPCM16(new Int16Array(100));
    player.appendPCM16(new Int16Array(100));

    context.sources[0]?.onended?.();
    expect(onPlaybackEnd).not.toHaveBeenCalled();
    context.sources[1]?.onended?.();
    expect(onPlaybackEnd).toHaveBeenCalledOnce();
  });
});
