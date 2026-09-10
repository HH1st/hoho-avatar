import { AudioOutput } from "./AudioOutput";
import { abortError } from "../internal/abort";
import type { AudioClipMetadata } from "./AudioClipPlayer";

export interface AudioQueuePlayerOptions {
  onPCM: (chunk: Float32Array) => void;
  onPlaybackStart?: (metadata: AudioClipMetadata) => void | Promise<void>;
  onEnded?: () => void;
}

/**
 * Decodes audio clips and schedules them on one AudioContext timeline. Appended
 * clips share one AudioWorklet, so PCM and audible playback remain continuous
 * across clip boundaries.
 */
export class AudioQueuePlayer {
  private readonly output: AudioOutput;
  private operation = new AbortController();
  private generation = 0;
  private started = false;
  private ending = false;
  private destroyed = false;
  private pendingAppends = 0;
  private appendTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: AudioQueuePlayerOptions) {
    this.output = new AudioOutput(options.onPCM, () => this.finishIfDrained());
  }

  get active(): boolean {
    return this.started || this.output.active || this.pendingAppends > 0;
  }

  async prepare(): Promise<void> {
    this.assertActive();
    await this.output.runtime.wait(this.output.prepare(), this.operation.signal);
  }

  async append(input: Blob | ArrayBuffer): Promise<AudioClipMetadata> {
    this.assertActive();
    const generation = this.generation;
    this.pendingAppends += 1;
    const signal = this.operation.signal;
    const operation = this.output.runtime.wait(this.appendTail.then(() => this.appendInOrder(input, generation, signal)), signal);
    this.appendTail = operation.then(() => undefined, () => undefined);
    try {
      return await operation;
    } finally {
      if (generation === this.generation) {
        this.pendingAppends -= 1;
        this.finishIfDrained();
      }
    }
  }

  private async appendInOrder(input: Blob | ArrayBuffer, generation: number, signal: AbortSignal): Promise<AudioClipMetadata> {
    if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");
    const encoded = input instanceof ArrayBuffer ? input.slice(0) : await this.output.runtime.wait(input.arrayBuffer(), signal);
    signal.throwIfAborted();
    const buffer = await this.output.runtime.wait(this.output.context.decodeAudioData(encoded), signal);
    await this.prepare();
    if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");

    const metadata: AudioClipMetadata = {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
    if (!this.started) {
      await this.output.runtime.wait(Promise.resolve(this.options.onPlaybackStart?.(metadata)), signal);
      if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");
      this.started = true;
    }

    this.output.append(buffer);
    return metadata;
  }

  finish(): void {
    this.assertActive();
    this.ending = true;
    this.finishIfDrained();
  }

  stop(): void {
    this.assertActive();
    ++this.generation;
    this.appendTail = Promise.resolve();
    this.operation.abort(abortError());
    this.operation = new AbortController();
    this.output.stop();
    this.pendingAppends = 0;
    this.started = false;
    this.ending = false;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) { await this.output.destroy(); return; }
    this.stop();
    this.destroyed = true;
    await this.output.destroy();
  }

  private finishIfDrained(): void {
    if (!this.ending || this.pendingAppends > 0 || this.output.active) return;
    this.ending = false;
    this.started = false;
    this.options.onEnded?.();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("AudioQueuePlayer has been destroyed");
  }
}
