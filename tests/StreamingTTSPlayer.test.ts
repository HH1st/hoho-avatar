import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingTTSPlayer, takeTTSChunks } from "../src/audio-source/StreamingTTSPlayer";

describe("takeTTSChunks", () => {
  it("keeps an unfinished incremental tail", () => {
    const result = takeTTSChunks("This is the first complete sentence. This is still arriving", {
      minCharacters: 20,
    });

    expect(result.chunks).toEqual(["This is the first complete sentence."]);
    expect(result.remainder).toBe("This is still arriving");
  });

  it("splits a long tail on whitespace", () => {
    const result = takeTTSChunks("one two three four five six seven eight", {
      minCharacters: 10,
      maxCharacters: 20,
    });

    expect(result.chunks[0]).toBe("one two three four");
    expect(result.remainder).toBe("five six seven eight");
  });

  it("flushes the final phrase", () => {
    expect(takeTTSChunks("final words", { flush: true }).chunks).toEqual(["final words"]);
  });
});

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
  readonly resume = vi.fn().mockResolvedValue(undefined);
  readonly decodeAudioData = vi.fn().mockResolvedValue({ duration: 1, numberOfChannels: 1, sampleRate: 48000 });
  currentTime = 0;

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

describe("StreamingTTSPlayer", () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          context = new FakeAudioContext();
          return context;
        }
      },
    );
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts the first phrase while the next phrase is still synthesizing", async () => {
    const spoken: string[] = [];
    let releaseSecond!: (value: Blob) => void;
    const secondAudio = new Promise<Blob>((resolve) => {
      releaseSecond = resolve;
    });
    const player = new StreamingTTSPlayer({
      synthesize: async (text) => {
        spoken.push(text);
        if (spoken.length === 2) return secondAudio;
        return new Blob([text]);
      },
      onPCM: vi.fn(),
      minChunkCharacters: 1,
      prebufferChunks: 1,
    });

    player.speak("First sentence. Second sentence.");
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));

    expect(spoken).toEqual(["First sentence.", "Second sentence."]);
    releaseSecond(new Blob(["Second sentence."]));
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    await player.destroy();
  });

  it("keeps smooth-mode text in one complete synthesis", async () => {
    const spoken: string[] = [];
    const player = new StreamingTTSPlayer({
      synthesize: async (text) => {
        spoken.push(text);
        return new Blob([text]);
      },
      onPCM: vi.fn(),
    });

    player.speakComplete("First sentence. Second sentence. Third sentence.");
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(spoken).toEqual(["First sentence. Second sentence. Third sentence."]);
    await player.destroy();
  });

  it("synthesizes every streaming phrase once and appends them on one continuous timeline", async () => {
    const spoken: string[] = [];
    const player = new StreamingTTSPlayer({
      synthesize: async (text) => {
        spoken.push(text);
        return new Blob([text]);
      },
      onPCM: vi.fn(),
      minChunkCharacters: 1,
      prebufferChunks: 2,
    });

    player.write("First sentence. Second sentence. Third sentence. ");
    player.flush();
    await vi.waitFor(() => expect(context.sources).toHaveLength(3));

    expect(spoken).toEqual(["First sentence.", "Second sentence.", "Third sentence."]);
    expect(context.sources.map((source) => source.start.mock.calls[0]?.[0])).toEqual([0.02, 1.02, 2.02]);
    await player.destroy();
  });

  it("stays stopping until an in-flight synthesis returns and rejects re-entry", async () => {
    let releaseSynthesis!: (value: Blob) => void;
    const synthesis = new Promise<Blob>((resolve) => {
      releaseSynthesis = resolve;
    });
    const states: string[] = [];
    const player = new StreamingTTSPlayer({
      synthesize: () => synthesis,
      onPCM: vi.fn(),
      onStateChange: (state) => states.push(state),
    });

    player.speak("A synthesis operation that is still running.");
    expect(player.state).toBe("synthesizing");
    player.stop();
    expect(player.state).toBe("stopping");
    expect(() => player.speak("Do not overlap this request.")).toThrow(/still stopping/);

    releaseSynthesis(new Blob(["cancelled"]));
    await vi.waitFor(() => expect(player.state).toBe("idle"));
    expect(context.sources).toHaveLength(0);
    expect(states).toContain("stopping");
    await player.destroy();
  });

  it("publishes synthesis failures through both state and error callbacks", async () => {
    const states: string[] = [];
    const onError = vi.fn();
    const player = new StreamingTTSPlayer({
      synthesize: async () => { throw new Error("synthesis failed"); },
      onPCM: vi.fn(),
      onError,
      onStateChange: (state) => states.push(state),
    });

    player.speak("This request fails during synthesis.");
    await vi.waitFor(() => expect(player.state).toBe("error"));
    expect(states).toEqual(["synthesizing", "error"]);
    expect(onError).toHaveBeenCalledOnce();
    await player.destroy();
  });
});
