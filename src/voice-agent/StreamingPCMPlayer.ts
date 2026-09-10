import { AudioOutput } from "../audio-source/AudioOutput";
import { pcm16ToFloat32 } from "./pcm";

export interface StreamingPCMPlayerOptions {
  sampleRate?: number;
  onPCM?: (chunk: Float32Array) => void;
  onPlaybackEnd?: () => void;
}

export class StreamingPCMPlayer {
  private readonly output: AudioOutput;
  private destroyed = false;

  constructor(private readonly options: StreamingPCMPlayerOptions = {}) {
    this.output = new AudioOutput((chunk) => options.onPCM?.(chunk), () => options.onPlaybackEnd?.());
  }

  get active(): boolean { return this.output.active; }

  /** Sample rate of PCM emitted by the playback AudioWorklet. */
  get outputSampleRate(): number {
    return this.output.context.sampleRate;
  }

  async prepare(): Promise<void> {
    this.assertActive();
    await this.output.prepare();
  }

  appendPCM16(pcm: Int16Array): void {
    this.assertActive();
    const float32 = pcm16ToFloat32(pcm);
    const sampleRate = this.options.sampleRate ?? 24_000;
    const buffer = this.output.context.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);
    this.output.append(buffer);
  }

  interrupt(): void { this.output.stop(); }

  async destroy(): Promise<void> {
    this.destroyed = true;
    await this.output.destroy();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("StreamingPCMPlayer has been destroyed");
  }
}
