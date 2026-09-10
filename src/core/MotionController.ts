import { BlinkController } from '../animation/BlinkController';
import { MouthClassifier } from '../audio/MouthClassifier';
import { PCMAnalyzer } from '../audio/PCMAnalyzer';
import type { MotionFrame } from './types';
import { CharacterState, isCharacterState } from './CharacterState';
import { MouthState, isMouthState } from './MouthState';
import type { AvatarRenderer, RendererCapabilities } from './renderer';

/** One PCM → motion → animation loop for every rendering backend. */
export class MotionController {
  readonly ready: Promise<void>;
  private analyzer: PCMAnalyzer;
  private readonly classifier = new MouthClassifier();
  private readonly blink = new BlinkController();
  private readonly listeners = new Set<(frame: MotionFrame) => void>();
  private animationFrame?: number;
  private running = false;
  private destroyed = false;
  private lastTime = 0;
  private state: CharacterState = CharacterState.Idle;
  private mouthOverride?: MouthState;
  private blinkOverride = false;
  private motion: MotionFrame = { timestamp: 0, speaking: false, energy: 0, mouth: MouthState.Closed };
  constructor(private readonly backend: AvatarRenderer, sampleRate = 48_000, private readonly onError?: (error: Error) => void) {
    this.validateRate(sampleRate); this.analyzer = new PCMAnalyzer({ sampleRate });
    this.ready = backend.ready.then(() => this.assertActive()).catch((error) => { this.destroy(); throw error; });
  }
  get capabilities(): RendererCapabilities { return this.backend.capabilities; }
  resize(): void { this.assertActive(); this.backend.resize(); }
  resetView(): void { this.assertActive(); this.backend.resetView(); }
  setViewControlEnabled(enabled: boolean): void { this.assertActive(); this.backend.setViewControlEnabled(enabled); }
  getMotionFrame(): Readonly<MotionFrame> { return this.motion; }
  getState(): CharacterState { return this.state; }
  onMotion(listener: (frame: MotionFrame) => void): () => void {
    this.assertActive(); this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  pushPCM(data: Int16Array | Float32Array): void {
    this.assertActive(); this.mouthOverride = undefined;
    for (const features of this.analyzer.push(data)) {
      this.motion = this.classifier.update(features); this.emit();
      if (this.destroyed) break;
    }
  }
  setSampleRate(sampleRate: number): void {
    this.assertActive(); this.validateRate(sampleRate);
    if (sampleRate === this.analyzer.sampleRate) return;
    this.analyzer = new PCMAnalyzer({ sampleRate }); this.resetAudio();
  }
  resetAudio(): void {
    this.assertActive(); this.analyzer.reset(); this.motion = this.classifier.reset();
    this.mouthOverride = undefined; this.backend.reset(); this.emit();
  }
  setState(state: CharacterState): void {
    this.assertActive();
    if (!isCharacterState(state)) throw new Error('Unknown character state');
    this.state = state;
  }
  previewMouth(mouth?: MouthState): void {
    this.assertActive();
    if (mouth !== undefined && !isMouthState(mouth)) throw new Error('Unknown mouth state');
    this.mouthOverride = mouth;
  }
  previewBlink(closed: boolean): void { this.assertActive(); this.blinkOverride = closed; }
  start(): void {
    this.assertActive(); if (this.running) return;
    this.running = true; this.lastTime = performance.now(); this.blink.start(this.lastTime);
    const draw = (now: number) => {
      if (!this.running || this.destroyed) return;
      this.animationFrame = undefined;
      const motion = this.mouthOverride ? { ...this.motion, mouth: this.mouthOverride } : this.motion;
      try {
        this.backend.render({ motion, eyesClosed: this.blinkOverride || this.blink.isClosed(now), state: this.state,
          timestamp: now, deltaSeconds: Math.max(0, Math.min(0.1, (now - this.lastTime) / 1000)) });
      } catch (error) {
        this.reportError(error);
        return;
      }
      this.lastTime = now;
      if (this.running && !this.destroyed) this.animationFrame = requestAnimationFrame(draw);
    };
    this.animationFrame = requestAnimationFrame(draw);
  }
  stop(): void {
    this.running = false;
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
  }
  reportError(value: unknown): void {
    this.stop();
    const error = value instanceof Error ? value : new Error(String(value));
    try {
      if (this.onError) this.onError(error);
      else console.error(error);
    } catch (callbackError) {
      console.error(callbackError);
    }
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.stop(); this.analyzer.reset(); this.motion = this.classifier.reset();
    try { this.emit(); } finally { this.listeners.clear(); this.backend.destroy(); }
  }
  protected assertActive(): void { if (this.destroyed) throw new Error('MotionController has been destroyed'); }
  private emit(): void { for (const listener of this.listeners) listener(this.motion); }
  private validateRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('sampleRate must be a positive finite number');
  }
}
