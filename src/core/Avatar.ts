import { AudioClipPlayer } from "../audio-source/AudioClipPlayer";
import type { AudioClipMetadata } from "../audio-source/AudioClipPlayer";
import { MicrophoneInput } from "../audio-source/MicrophoneInput";
import { TalkingSprite } from "./TalkingSprite";
import type { CharacterDefinition, MotionFrame } from "./types";

export interface AvatarOptions {
  character: string | CharacterDefinition;
  /** Rate of externally supplied mono PCM. Default: 48 kHz. */
  sampleRate?: number;
  onMotion?: (frame: MotionFrame) => void;
}

/** A ready-to-use avatar with owned audio capture and playback. */
export class Avatar {
  private player?: AudioClipPlayer;
  private microphone?: MicrophoneInput;
  private operation?: AbortController;
  private destroyed = false;
  private closing: Promise<void> = Promise.resolve();

  constructor(private readonly sprite: TalkingSprite) {}

  /** Supply PCM as it is played, not a whole clip ahead of its playback. */
  pushPCM(chunk: Int16Array | Float32Array, sampleRate?: number): void {
    this.assertActive();
    if (this.operation) throw new Error("Call stopAudio() before supplying external PCM");
    if (sampleRate !== undefined) this.sprite.setSampleRate(sampleRate);
    this.sprite.pushPCM(chunk);
  }

  onMotion(listener: (frame: MotionFrame) => void): () => void {
    this.assertActive();
    return this.sprite.onMotion(listener);
  }

  getMotionFrame(): Readonly<MotionFrame> { return this.sprite.getMotionFrame(); }

  /** Call from a user gesture. Resolves when playback starts. Replaces prior audio. */
  async playAudio(input: string | Blob | ArrayBuffer): Promise<AudioClipMetadata> {
    this.assertActive();
    this.stopAudio();
    const operation = new AbortController();
    this.operation = operation;
    try {
      const player = new AudioClipPlayer({
        onPCM: (chunk) => { if (this.operation === operation) this.sprite.pushPCM(chunk); },
        onEnded: () => { if (this.operation === operation) this.stopAudio(); },
      });
      this.player = player;
      // Resume before fetch/decode so browser user activation is retained.
      await player.prepare();
      operation.signal.throwIfAborted();
      let encoded: Blob | ArrayBuffer;
      if (typeof input === "string") {
        const response = await fetch(input, { signal: operation.signal });
        if (!response.ok) throw new Error(`Unable to load audio: ${response.status}`);
        encoded = await response.arrayBuffer();
      } else encoded = input;
      operation.signal.throwIfAborted();
      const metadata = await player.load(encoded);
      operation.signal.throwIfAborted();
      this.sprite.setSampleRate(metadata.sampleRate);
      await player.play();
      operation.signal.throwIfAborted();
      return metadata;
    } catch (error) {
      if (this.operation === operation) this.stopAudio();
      throw error;
    }
  }

  /** Local visualization only. No microphone audio is uploaded. */
  async startMicrophone(): Promise<void> {
    this.assertActive();
    this.stopAudio();
    const operation = new AbortController();
    this.operation = operation;
    try {
      const microphone = new MicrophoneInput((chunk, sampleRate) => {
        if (this.operation !== operation) return;
        this.sprite.setSampleRate(sampleRate);
        this.sprite.pushPCM(chunk);
      });
      this.microphone = microphone;
      await microphone.prepare();
      operation.signal.throwIfAborted();
      await microphone.start(operation.signal);
      operation.signal.throwIfAborted();
    } catch (error) {
      if (this.operation === operation) this.stopAudio();
      throw error;
    }
  }

  /** Immediately silence, release capture, cancel startup and close the mouth. */
  stopAudio(): void {
    if (this.destroyed) return;
    this.operation?.abort();
    this.operation = undefined;
    const player = this.player;
    const microphone = this.microphone;
    this.player = undefined;
    this.microphone = undefined;
    this.sprite.resetAudio();
    this.closing = Promise.allSettled([this.closing, player?.destroy(), microphone?.destroy()]).then(() => undefined);
  }

  async destroy(): Promise<void> {
    if (!this.destroyed) {
      this.stopAudio();
      this.destroyed = true;
      this.sprite.destroy();
    }
    await this.closing;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("Avatar has been destroyed");
  }
}

/** Load assets and start rendering. Does not request microphone access. */
export async function createAvatar(canvas: HTMLCanvasElement, options: AvatarOptions): Promise<Avatar> {
  const sprite = new TalkingSprite(canvas, { character: options.character, sampleRate: options.sampleRate ?? 48_000 });
  try {
    await sprite.ready;
    if (options.onMotion) sprite.onMotion(options.onMotion);
    sprite.start();
    return new Avatar(sprite);
  } catch (error) {
    sprite.destroy();
    throw error;
  }
}
