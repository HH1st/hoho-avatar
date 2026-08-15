import type { AudioFeatures, MotionFrame, MouthState } from "../core/types";

export interface MouthClassifierOptions {
  silenceThreshold?: number;
  loudThreshold?: number;
  highFrequencyThreshold?: number;
  roundThreshold?: number;
  minStateDurationMs?: number;
  silenceDelayMs?: number;
}

export class MouthClassifier {
  private readonly options: Required<MouthClassifierOptions>;
  private current: MouthState = "closed";
  private lastChange = -Infinity;
  private silenceSince: number | null = null;

  constructor(options: MouthClassifierOptions = {}) {
    this.options = {
      silenceThreshold: options.silenceThreshold ?? 0.018,
      loudThreshold: options.loudThreshold ?? 0.16,
      highFrequencyThreshold: options.highFrequencyThreshold ?? 2800,
      roundThreshold: options.roundThreshold ?? 0.72,
      minStateDurationMs: options.minStateDurationMs ?? 50,
      silenceDelayMs: options.silenceDelayMs ?? 80,
    };
  }

  update(features: AudioFeatures): MotionFrame {
    const { timestamp, rms } = features;
    let next = this.rawState(features);

    if (next === "closed") {
      this.silenceSince ??= timestamp;
      if (timestamp - this.silenceSince < this.options.silenceDelayMs) next = this.current;
    } else {
      this.silenceSince = null;
    }

    if (next !== this.current && timestamp - this.lastChange >= this.options.minStateDurationMs) {
      this.current = next;
      this.lastChange = timestamp;
    }

    return {
      timestamp,
      speaking: this.current !== "closed",
      energy: Math.max(0, Math.min(1, rms / 0.28)),
      mouth: this.current,
    };
  }

  reset(timestamp = performance.now()): MotionFrame {
    this.current = "closed";
    this.lastChange = timestamp;
    this.silenceSince = null;
    return { timestamp, speaking: false, energy: 0, mouth: "closed" };
  }

  private rawState(features: AudioFeatures): MouthState {
    if (features.rms < this.options.silenceThreshold) return "closed";
    if (features.rms > this.options.loudThreshold) return "large";
    if (features.spectralCentroid > this.options.highFrequencyThreshold) return "wide";
    if (features.lowBandRatio > this.options.roundThreshold) return "round";
    return "small";
  }
}
