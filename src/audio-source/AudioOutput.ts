import { AudioRuntime } from './AudioRuntime';

/** Shared audible buffer timeline and PCM worklet for queued/streaming playback. */
export class AudioOutput {
  readonly runtime = new AudioRuntime();
  readonly context = this.runtime.context;
  private worklet?: AudioWorkletNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  constructor(private readonly onPCM: (chunk: Float32Array) => void, private readonly onDrained: () => void) {}
  get active(): boolean { return this.sources.size > 0; }

  async prepare(): Promise<void> {
    await this.runtime.prepare();
    this.runtime.signal.throwIfAborted();
    if (!this.worklet) {
      const worklet = new AudioWorkletNode(this.context, 'audio-clip-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, channelCountMode: 'max',
      });
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.runtime.signal.aborted && this.active) this.onPCM(event.data);
      };
      worklet.connect(this.context.destination);
      this.worklet = worklet;
    }
  }

  append(buffer: AudioBuffer): void {
    this.runtime.signal.throwIfAborted();
    if (!this.worklet) throw new Error('Audio output must be prepared before appending');
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.worklet);
    const startAt = Math.max(this.context.currentTime + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.active) this.onDrained();
    };
    try { source.start(startAt); }
    catch (error) { source.disconnect(); this.sources.delete(source); throw error; }
  }

  stop(): void {
    this.worklet?.port.postMessage({ type: 'reset' });
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.sources.clear();
    this.nextStartTime = 0;
  }

  destroy(): Promise<void> {
    this.stop();
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.port.close(); this.worklet?.disconnect(); this.worklet = undefined;
    return this.runtime.destroy();
  }
}
