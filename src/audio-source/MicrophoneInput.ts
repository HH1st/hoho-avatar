/** Owns one microphone capture, including permission requests that finish after cancellation. */
export class MicrophoneInput {
  private readonly context = new AudioContext();
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private sink?: GainNode;
  private closed?: Promise<void>;

  constructor(private readonly onPCM: (chunk: Float32Array, sampleRate: number) => void) {}

  get sampleRate(): number { return this.context.sampleRate; }

  prepare(): Promise<void> { return this.context.resume(); }

  async start(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
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
      const stream = await Promise.race([pending, aborted]);
      if (signal.aborted || this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("Microphone request cancelled", "AbortError");
      }
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = this.context.createScriptProcessor(1024, 1, 1);
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.processor.onaudioprocess = (event) => {
        if (!signal.aborted && !this.closed) this.onPCM(event.inputBuffer.getChannelData(0), this.context.sampleRate);
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
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.closed = this.context.close();
    return this.closed;
  }
}
