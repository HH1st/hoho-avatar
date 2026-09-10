import { AudioRuntime } from "./AudioRuntime";

/** Owns one microphone capture, including permission requests that finish after cancellation. */
export class MicrophoneInput {
  private readonly runtime = new AudioRuntime();
  private readonly context = this.runtime.context;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: AudioWorkletNode;
  private sink?: GainNode;
  private closed?: Promise<void>;

  constructor(private readonly onPCM: (chunk: Float32Array, sampleRate: number) => void) {}

  get sampleRate(): number { return this.context.sampleRate; }

  /** Load the shared 20 ms mono PCM worklet and unlock audio from a user gesture. */
  async prepare(): Promise<void> {
    this.assertActive();
    try {
      await this.runtime.prepare();
      if (this.closed) throw new DOMException("Microphone setup cancelled", "AbortError");
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  async start(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    this.assertActive();
    const cancelled = () => { void this.destroy(); };
    signal.addEventListener("abort", cancelled, { once: true });
    let abort!: () => void;
    try {
      const pending = navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      // getUserMedia cannot be cancelled. Dispose a late result immediately.
      void pending.then((stream) => {
        if (signal.aborted || this.closed) stream.getTracks().forEach((track) => track.stop());
      }, () => undefined);
      const aborted = new Promise<never>((_, reject) => {
        abort = () => reject(new DOMException("Microphone request cancelled", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
      });
      const stream = await this.runtime.wait(Promise.race([pending, aborted]));
      if (signal.aborted || this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("Microphone request cancelled", "AbortError");
      }
      this.stream = stream;
      await this.runtime.wait(Promise.race([this.runtime.loadWorklet(), aborted]));
      if (signal.aborted || this.closed) {
        throw new DOMException("Microphone setup cancelled", "AbortError");
      }
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = new AudioWorkletNode(this.context, "audio-clip-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      this.sink = this.context.createGain();
      // Keep the capture graph rendering without playing microphone audio locally.
      this.sink.gain.value = 0;
      this.processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!signal.aborted && !this.closed) this.onPCM(event.data, this.context.sampleRate);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.context.destination);
    } catch (error) {
      await this.destroy();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      // The owner calls destroy on session end; no listener needs to retain this object.
      signal.removeEventListener("abort", cancelled);
    }
  }

  destroy(): Promise<void> {
    if (this.closed) return this.closed;

    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.port.close();
    }
    this.processor?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.closed = this.runtime.destroy();
    return this.closed;
  }

  private assertActive(): void {
    if (this.closed) throw new Error("MicrophoneInput has been destroyed");
  }
}
