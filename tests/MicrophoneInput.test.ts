import { afterEach, describe, expect, it, vi } from "vitest";
import { MicrophoneInput } from "../src/audio-source/MicrophoneInput";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const sink = { ...node(), gain: { value: 1 } };
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const capture = vi.fn().mockResolvedValue(stream);
  const addModule = vi.fn().mockResolvedValue(undefined);
  const context = {
    sampleRate: 48_000, destination: {}, audioWorklet: { addModule },
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createMediaStreamSource: vi.fn(() => source), createGain: vi.fn(() => sink),
  };
  const processor = { ...node(), port: { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null, close: vi.fn() } };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  vi.stubGlobal("AudioWorkletNode", class { constructor() { return processor; } });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: capture } });
  const onPCM = vi.fn();
  return { microphone: new MicrophoneInput(onPCM), onPCM, context, processor, source, sink, track, stream, capture, addModule };
}

describe("MicrophoneInput", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delivers worklet PCM at the context rate without monitoring the microphone", async () => {
    const { microphone, onPCM, context, processor, source, sink, addModule, track } = setup();
    await microphone.prepare();
    await microphone.start(new AbortController().signal);
    expect(addModule).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(sink);
    expect(sink.gain.value).toBe(0);
    expect(sink.connect).toHaveBeenCalledWith(context.destination);
    const deliver = processor.port.onmessage!;
    const chunk = new Float32Array(960).fill(0.25);
    deliver({ data: chunk } as MessageEvent<Float32Array>);
    expect(onPCM).toHaveBeenCalledWith(chunk, 48_000);
    await microphone.destroy();
    deliver({ data: chunk } as MessageEvent<Float32Array>);
    expect(onPCM).toHaveBeenCalledOnce();
    expect(processor.port.onmessage).toBeNull();
    expect(processor.port.close).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(processor.disconnect).toHaveBeenCalledOnce();
    expect(sink.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    await microphone.destroy();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("releases capture immediately when cancelled during worklet loading", async () => {
    const { microphone, addModule, context, track } = setup();
    const loading = deferred<void>();
    addModule.mockReturnValue(loading.promise);
    const abort = new AbortController();
    const pending = microphone.start(abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(addModule).toHaveBeenCalledOnce());
    abort.abort();
    await rejected;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    loading.resolve();
    await Promise.resolve();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it("rejects startup immediately if destroyed while the module is loading", async () => {
    const { microphone, addModule, context, track } = setup();
    const loading = deferred<void>();
    addModule.mockReturnValue(loading.promise);
    const pending = microphone.start(new AbortController().signal);
    const settled = vi.fn();
    const rejected = expect(pending.catch((error) => { settled(); throw error; })).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(addModule).toHaveBeenCalledOnce());
    await microphone.destroy();
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce(), { timeout: 100 });
    await rejected;
    loading.resolve();
    await Promise.resolve();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("rejects preparation when destroyed without waiting for the worklet download", async () => {
    const { microphone, addModule, capture, context } = setup();
    const loading = deferred<void>();
    addModule.mockReturnValue(loading.promise);
    const settled = vi.fn();
    const preparing = microphone.prepare().catch((error) => { settled(); throw error; });
    const rejected = expect(preparing).rejects.toMatchObject({ name: "AbortError" });
    await microphone.destroy();
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce(), { timeout: 100 });
    await rejected;
    expect(context.close).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
    loading.reject(new Error("Download stopped after cancellation"));
    await Promise.resolve();
  });

  it("stops an acquired stream if worklet loading fails", async () => {
    const { microphone, addModule, track, context } = setup();
    const error = new Error("Module unavailable");
    addModule.mockRejectedValue(error);
    await expect(microphone.start(new AbortController().signal)).rejects.toBe(error);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("closes the context if preparation fails before requesting microphone access", async () => {
    const { microphone, addModule, capture, context } = setup();
    const error = new Error("Module unavailable");
    addModule.mockRejectedValue(error);
    await expect(microphone.prepare()).rejects.toBe(error);
    expect(capture).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("disposes microphone permission granted after cancellation", async () => {
    const { microphone, capture, stream, track, addModule } = setup();
    const permission = deferred<typeof stream>();
    capture.mockReturnValue(permission.promise);
    const abort = new AbortController();
    const pending = microphone.start(abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await rejected;
    permission.resolve(stream);
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(addModule).not.toHaveBeenCalled();
  });
});
