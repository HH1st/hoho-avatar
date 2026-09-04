import processorUrl from "../audio-source/audio-clip-processor.ts?worker&url";
import { pcm16ToFloat32 } from "./pcm";

export interface StreamingPCMPlayerOptions {
  sampleRate?: number;
  onPCM?: (chunk: Float32Array) => void;
  onPlaybackEnd?: () => void;
}

export class StreamingPCMPlayer {
  private readonly context = new AudioContext();
  private readonly workletReady = this.createWorklet();
  private readonly sources = new Set<AudioBufferSourceNode>();
  private worklet?: AudioWorkletNode;
  private nextStartTime = 0;
  private destroyed = false;

  constructor(private readonly options: StreamingPCMPlayerOptions = {}) {}

  /** Sample rate of PCM emitted by the playback AudioWorklet. */
  get outputSampleRate(): number {
    return this.context.sampleRate;
  }

  async prepare(): Promise<void> {
    this.assertActive();
    await Promise.all([this.workletReady, this.context.resume()]);
  }

  appendPCM16(pcm: Int16Array): void {
    this.assertActive();
    const float32 = pcm16ToFloat32(pcm);
    const sampleRate = this.options.sampleRate ?? 24_000;
    const buffer = this.context.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    if (!this.worklet) throw new Error("StreamingPCMPlayer must be prepared before appending audio");
    source.connect(this.worklet);
    const startAt = Math.max(this.context.currentTime + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (this.sources.size === 0) this.options.onPlaybackEnd?.();
    };
    source.start(startAt);
  }

  interrupt(): void {
    this.worklet?.port.postMessage({ type: "reset" });
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.sources.clear();
    this.nextStartTime = this.context.currentTime;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.interrupt();
    this.destroyed = true;
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.worklet = undefined;
    await this.context.close();
  }

  private async createWorklet(): Promise<void> {
    await this.context.audioWorklet.addModule(processorUrl);
    if (this.destroyed) return;
    const worklet = new AudioWorkletNode(this.context, "audio-clip-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: "max",
    });
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.sources.size > 0) this.options.onPCM?.(event.data);
    };
    worklet.connect(this.context.destination);
    this.worklet = worklet;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("StreamingPCMPlayer has been destroyed");
  }
}
