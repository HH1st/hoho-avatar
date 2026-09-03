import processorUrl from "./audio-clip-processor.ts?worker&url";
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
  private readonly context = new AudioContext();
  private readonly workletReady = this.createWorklet();
  private readonly sources = new Set<AudioBufferSourceNode>();
  private worklet?: AudioWorkletNode;
  private nextStartTime = 0;
  private generation = 0;
  private started = false;
  private ending = false;
  private destroyed = false;
  private pendingAppends = 0;
  private appendTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: AudioQueuePlayerOptions) {}

  get active(): boolean {
    return this.started || this.sources.size > 0 || this.pendingAppends > 0;
  }

  async prepare(): Promise<void> {
    this.assertActive();
    await Promise.all([this.workletReady, this.context.resume()]);
  }

  async append(input: Blob | ArrayBuffer): Promise<AudioClipMetadata> {
    this.assertActive();
    const generation = this.generation;
    this.pendingAppends += 1;
    const operation = this.appendTail.then(() => this.appendInOrder(input, generation));
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

  private async appendInOrder(input: Blob | ArrayBuffer, generation: number): Promise<AudioClipMetadata> {
    if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");
    const encoded = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer();
    const buffer = await this.context.decodeAudioData(encoded);
    await this.prepare();
    if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");

    const metadata: AudioClipMetadata = {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
    if (!this.started) {
      await this.options.onPlaybackStart?.(metadata);
      if (generation !== this.generation) throw new DOMException("Audio append was cancelled", "AbortError");
      this.started = true;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.worklet!);
    const startAt = Math.max(this.nextStartTime, this.context.currentTime + 0.02);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      if (generation !== this.generation) return;
      source.disconnect();
      this.sources.delete(source);
      this.finishIfDrained();
    };
    source.start(startAt);
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
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A scheduled source may already have ended.
      }
      source.disconnect();
    }
    this.sources.clear();
    this.pendingAppends = 0;
    this.nextStartTime = 0;
    this.started = false;
    this.ending = false;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.stop();
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
      if (this.sources.size > 0) this.options.onPCM(event.data);
    };
    worklet.connect(this.context.destination);
    this.worklet = worklet;
  }

  private finishIfDrained(): void {
    if (!this.ending || this.pendingAppends > 0 || this.sources.size > 0) return;
    this.ending = false;
    this.started = false;
    this.nextStartTime = 0;
    this.options.onEnded?.();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("AudioQueuePlayer has been destroyed");
  }
}
