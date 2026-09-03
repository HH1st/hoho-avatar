import { BlinkController } from "../animation/BlinkController";
import { MouthClassifier } from "../audio/MouthClassifier";
import { PCMAnalyzer } from "../audio/PCMAnalyzer";
import { loadCharacter } from "../renderer/AssetLoader";
import { SpriteRenderer } from "../renderer/SpriteRenderer";
import type { CharacterState, MotionFrame, TalkingSpriteOptions } from "./types";

export class TalkingSprite {
  readonly ready: Promise<void>;
  private readonly analyzer: PCMAnalyzer;
  private readonly classifier = new MouthClassifier();
  private readonly blink = new BlinkController();
  private renderer?: SpriteRenderer;
  private animationFrame?: number;
  private destroyed = false;
  private state: CharacterState = "idle";
  private motion: MotionFrame = { timestamp: 0, speaking: false, energy: 0, mouth: "closed" };
  private listeners = new Set<(frame: MotionFrame) => void>();

  constructor(private readonly canvas: HTMLCanvasElement, options: TalkingSpriteOptions) {
    this.analyzer = new PCMAnalyzer({ sampleRate: options.sampleRate });
    this.ready = loadCharacter(options.character).then((character) => {
      if (this.destroyed) return;
      this.renderer = new SpriteRenderer(canvas, character);
      this.renderer.render(this.motion, false);
    });
  }

  pushPCM(data: Int16Array | Float32Array): void {
    this.assertActive();
    for (const features of this.analyzer.push(data)) {
      this.motion = this.classifier.update(features);
      for (const listener of this.listeners) listener(this.motion);
    }
  }

  start(): void {
    this.assertActive();
    if (this.animationFrame !== undefined) return;
    this.blink.start();
    const draw = (now: number) => {
      this.renderer?.render(this.motion, this.blink.isClosed(now));
      this.animationFrame = requestAnimationFrame(draw);
    };
    this.animationFrame = requestAnimationFrame(draw);
  }

  stop(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
  }

  resetAudio(): void {
    this.assertActive();
    this.resetMotion();
  }

  private resetMotion(): void {
    this.analyzer.reset();
    this.motion = this.classifier.reset();
    for (const listener of this.listeners) listener(this.motion);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.resetMotion();
    this.listeners.clear();
    const context = this.canvas.getContext("2d");
    context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setState(state: CharacterState): void {
    this.assertActive();
    this.state = state;
  }

  getState(): CharacterState {
    return this.state;
  }

  getMotionFrame(): Readonly<MotionFrame> {
    return this.motion;
  }

  onMotion(listener: (frame: MotionFrame) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("TalkingSprite has been destroyed");
  }
}
