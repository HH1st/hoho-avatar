import { AudioClipPlayer } from "../audio-source/AudioClipPlayer";
import type { AudioClipMetadata } from "../audio-source/AudioClipPlayer";
import { MicrophoneInput } from "../audio-source/MicrophoneInput";
import { MotionController } from "./MotionController";
import type { RendererFactory, RendererCapabilities } from "./renderer";
import type { CharacterState, MotionFrame, MouthState } from "./types";
import { waitFor } from '../internal/abort';

export interface AvatarOptions {
  renderer: RendererFactory;
  /** Rate of externally supplied mono PCM. Default: 48 kHz. */
  sampleRate?: number;
  onMotion?: (frame: MotionFrame) => void;
  onError?: (error: Error) => void;
  /** Cancels asset loading before creation completes; does not own the ready avatar. */
  signal?: AbortSignal;
}

/** A ready-to-use avatar with owned audio capture and playback. */
export class Avatar {
  private player?: AudioClipPlayer;
  private microphone?: MicrophoneInput;
  private operation?: AbortController;
  private destroyed = false;
  private closing: Promise<void> = Promise.resolve();
  private destruction?: Promise<void>;

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
      await waitFor(player.prepare(), operation.signal);
      operation.signal.throwIfAborted();
      let encoded: Blob | ArrayBuffer;
      if (typeof input === "string") {
        const response = await fetch(input, { signal: operation.signal });
        if (!response.ok) throw new Error(`Unable to load audio: ${response.status}`);
        encoded = await response.arrayBuffer();
      } else encoded = input;
      operation.signal.throwIfAborted();
      const metadata = await waitFor(player.load(encoded), operation.signal);
      operation.signal.throwIfAborted();
      this.controller.setSampleRate(metadata.sampleRate);
      await waitFor(player.play(), operation.signal);
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
    // Take ownership of cleanup before invoking any renderer or consumer callback.
    const close = (resource?: { destroy(): Promise<void> }) => {
      try { return resource?.destroy(); } catch (error) { return Promise.reject(error); }
    };
    this.closing = Promise.allSettled([this.closing, close(player), close(microphone)]).then(() => undefined);
    this.controller.resetAudio();
  }

  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    this.destruction = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const errors: unknown[] = [];
    try { this.stopAudio(); } catch (error) { errors.push(error); }
    this.destroyed = true;
    try { this.controller.destroy(); } catch (error) { errors.push(error); }
    void this.closing.then(() => {
      if (errors.length) reject(new AggregateError(errors, 'Avatar cleanup callbacks failed'));
      else resolve();
    }, reject);
    return this.destruction;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("Avatar has been destroyed");
  }
}

/** Identical creation and lifecycle for every renderer implementation. */
export async function createAvatar(canvas: HTMLCanvasElement, options: AvatarOptions): Promise<Avatar> {
  options.signal?.throwIfAborted();
  const rate = options.sampleRate ?? 48_000;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('sampleRate must be a positive finite number');
  let controller: MotionController | undefined;
  const renderer = options.renderer(canvas, { onError: (error) => controller?.reportError(error) });
  controller = new MotionController(renderer, rate, options.onError);
  const avatar = new Avatar(controller);
  try {
    await waitFor(avatar.ready, options.signal);
    options.signal?.throwIfAborted();
    if (options.onMotion) avatar.onMotion(options.onMotion);
    avatar.start();
    return avatar;
  } catch (error) {
    try { controller.destroy(); } catch { /* Preserve the startup error; resources were released. */ }
    throw error;
  }
}
