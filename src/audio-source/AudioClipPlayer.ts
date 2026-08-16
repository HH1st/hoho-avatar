import processorUrl from "./audio-clip-processor.ts?worker&url";

export interface AudioClipMetadata {
  name?: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface AudioClipPlayerOptions {
  onPCM: (chunk: Float32Array) => void;
  onEnded?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
}

export type AudioClipPlayerState = "empty" | "loading" | "ready" | "playing" | "error" | "destroyed";

export class AudioClipPlayer {
  private readonly context = new AudioContext();
  private readonly workletReady = this.context.audioWorklet.addModule(processorUrl);
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private worklet?: AudioWorkletNode;
  private animationFrame?: number;
  private playPromise?: Promise<void>;
  private startedAt = 0;
  private generation = 0;
  private currentState: AudioClipPlayerState = "empty";

  constructor(private readonly options: AudioClipPlayerOptions) {}

  get state(): AudioClipPlayerState {
    return this.currentState;
  }

  async load(input: File | Blob | ArrayBuffer): Promise<AudioClipMetadata> {
    this.assertActive();
    this.stopSource();
    const generation = ++this.generation;
    this.buffer = undefined;
    this.currentState = "loading";

    try {
      const encoded = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer();
      const [buffer] = await Promise.all([this.context.decodeAudioData(encoded), this.workletReady]);
      if (generation !== this.generation) throw new DOMException("Audio load was replaced", "AbortError");

      this.buffer = buffer;
      this.currentState = "ready";
      this.options.onProgress?.(0, buffer.duration);
      return {
        name: typeof File !== "undefined" && input instanceof File ? input.name : undefined,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
      };
    } catch (error) {
      if (generation === this.generation) {
        this.buffer = undefined;
        this.currentState = "error";
      }
      throw error;
    }
  }

  async play(): Promise<void> {
    this.assertActive();
    if (!this.buffer) throw new Error("Load an audio clip before playing");
    if (this.currentState === "playing") {
      await this.playPromise;
      return;
    }

    const generation = ++this.generation;
    this.currentState = "playing";
    const operation = this.startPlayback(generation);
    this.playPromise = operation;
    try {
      await operation;
    } finally {
      if (this.playPromise === operation) this.playPromise = undefined;
    }
  }

  private async startPlayback(generation: number): Promise<void> {
    try {
      await this.workletReady;
      await this.context.resume();
      if (generation !== this.generation || this.currentState !== "playing") {
        throw new DOMException("Audio playback was cancelled", "AbortError");
      }
      const buffer = this.buffer;
      if (!buffer) throw new DOMException("Audio playback was cancelled", "AbortError");

      this.createSource(generation, buffer);
    } catch (error) {
      if (generation === this.generation) {
        this.stopSource();
        this.currentState = this.buffer ? "ready" : "empty";
      }
      throw error;
    }
  }

  private createSource(generation: number, buffer: AudioBuffer): void {
    const source = this.context.createBufferSource();
    const worklet = new AudioWorkletNode(this.context, "audio-clip-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: "max",
    });

    source.buffer = buffer;
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (generation === this.generation) this.options.onPCM(event.data);
    };
    source.onended = () => this.handleEnded(generation);
    source.connect(worklet);
    worklet.connect(this.context.destination);
    this.source = source;
    this.worklet = worklet;
    this.startedAt = this.context.currentTime;
    source.start();
    this.updateProgress(generation);
  }

  stop(): void {
    this.assertActive();
    if (this.currentState !== "playing") return;
    ++this.generation;
    this.stopSource();
    this.currentState = this.buffer ? "ready" : "empty";
    this.options.onProgress?.(0, this.buffer?.duration ?? 0);
  }

  async destroy(): Promise<void> {
    if (this.currentState === "destroyed") return;
    ++this.generation;
    this.stopSource();
    this.buffer = undefined;
    this.currentState = "destroyed";
    await this.context.close();
  }

  private handleEnded(generation: number): void {
    if (generation !== this.generation || this.currentState !== "playing") return;
    this.stopSource(false);
    this.currentState = "ready";
    this.options.onProgress?.(0, this.buffer?.duration ?? 0);
    this.options.onEnded?.();
  }

  private updateProgress(generation: number): void {
    if (generation !== this.generation || this.currentState !== "playing" || !this.buffer) return;
    const elapsed = Math.min(this.buffer.duration, this.context.currentTime - this.startedAt);
    this.options.onProgress?.(elapsed, this.buffer.duration);
    this.animationFrame = requestAnimationFrame(() => this.updateProgress(generation));
  }

  private stopSource(callStop = true): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.worklet = undefined;
    if (this.source) {
      this.source.onended = null;
      if (callStop) {
        try {
          this.source.stop();
        } catch {
          // The source may not have started yet.
        }
      }
      this.source.disconnect();
      this.source = undefined;
    }
  }

  private assertActive(): void {
    if (this.currentState === "destroyed") throw new Error("AudioClipPlayer has been destroyed");
  }
}
