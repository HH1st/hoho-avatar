import { AudioClipPlayer } from "../audio-source/AudioClipPlayer";
import type { AudioClipMetadata } from "../audio-source/AudioClipPlayer";
import { MicrophoneInput } from "../audio-source/MicrophoneInput";
import { MotionController } from "./MotionController";
import type { RendererFactory, RendererCapabilities } from "./renderer";
import type { CharacterState, MotionFrame, MouthState } from "./types";

export interface AvatarOptions {
  renderer: RendererFactory;
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

  constructor(private readonly controller: MotionController) {}

  get ready(): Promise<void> { return this.controller.ready; }
  get capabilities(): RendererCapabilities { return this.controller.capabilities; }
  start(): void { this.assertActive(); this.controller.start(); }
  stop(): void { this.assertActive(); this.controller.stop(); }
  setState(state: CharacterState): void { this.assertActive(); this.controller.setState(state); }
  getState(): CharacterState { return this.controller.getState(); }
  setSampleRate(rate: number): void { this.assertActive(); this.controller.setSampleRate(rate); }
  resetAudio(): void { this.assertActive(); this.controller.resetAudio(); }
  previewMouth(mouth?: MouthState): void { this.assertActive(); this.controller.previewMouth(mouth); }
  previewBlink(closed: boolean): void { this.assertActive(); this.controller.previewBlink(closed); }
  resize(): void { this.assertActive(); this.controller.resize(); }
  resetView(): void { this.assertActive(); this.controller.resetView(); }
  setViewControlEnabled(enabled: boolean): void { this.assertActive(); this.controller.setViewControlEnabled(enabled); }

  /** True while owned audio is starting, playing or capturing. */
  get audioActive(): boolean { return this.operation !== undefined; }

  /** Supply PCM as it is played, not a whole clip ahead of its playback. */
  pushPCM(chunk: Int16Array | Float32Array, sampleRate?: number): void {
    this.assertActive();
    if (this.operation) throw new Error("Call stopAudio() before supplying external PCM");
    if (sampleRate !== undefined) this.controller.setSampleRate(sampleRate);
    this.controller.pushPCM(chunk);
  }

  onMotion(listener: (frame: MotionFrame) => void): () => void {
    this.assertActive();
    return this.controller.onMotion(listener);
  }

  getMotionFrame(): Readonly<MotionFrame> { return this.controller.getMotionFrame(); }

  /** Call from a user gesture. Resolves when playback starts. Replaces prior audio. */
  async playAudio(input: string | Blob | ArrayBuffer): Promise<AudioClipMetadata> {
    this.assertActive();
    this.stopAudio();
    const operation = new AbortController();
    this.operation = operation;
    try {
      const player = new AudioClipPlayer({
        onPCM: (chunk) => { if (this.operation === operation) this.controller.pushPCM(chunk); },
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
      this.controller.setSampleRate(metadata.sampleRate);
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
        this.controller.setSampleRate(sampleRate);
        this.controller.pushPCM(chunk);
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
    this.controller.resetAudio();
    this.closing = Promise.allSettled([this.closing, player?.destroy(), microphone?.destroy()]).then(() => undefined);
  }

  async destroy(): Promise<void> {
    if (!this.destroyed) {
      this.stopAudio();
      this.destroyed = true;
      this.controller.destroy();
    }
    await this.closing;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("Avatar has been destroyed");
  }
}

/** Identical creation and lifecycle for every renderer implementation. */
export async function createAvatar(canvas: HTMLCanvasElement, options: AvatarOptions): Promise<Avatar> {
  const rate = options.sampleRate ?? 48_000;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('sampleRate must be a positive finite number');
  const controller = new MotionController(options.renderer(canvas), rate);
  const avatar = new Avatar(controller);
  try {
    await avatar.ready;
    if (options.onMotion) avatar.onMotion(options.onMotion);
    avatar.start();
    return avatar;
  } catch (error) {
    controller.destroy();
    throw error;
  }
}
