import type { AudioFeatures } from "../core/types";

export interface PCMAnalyzerOptions {
  sampleRate: number;
  windowMs?: number;
}

export class PCMAnalyzer {
  readonly sampleRate: number;
  readonly windowSize: number;
  private readonly pending: Float32Array;
  private pendingLength = 0;

  constructor({ sampleRate, windowMs = 30 }: PCMAnalyzerOptions) {
    if (sampleRate <= 0) throw new Error("sampleRate must be positive");
    this.sampleRate = sampleRate;
    this.windowSize = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
    this.pending = new Float32Array(this.windowSize);
  }

  push(data: Int16Array | Float32Array, timestamp = performance.now()): AudioFeatures[] {
    const result: AudioFeatures[] = [];
    for (let i = 0; i < data.length; i += 1) {
      const raw = data[i] ?? 0;
      this.pending[this.pendingLength] = data instanceof Int16Array ? raw / 32768 : Math.max(-1, Math.min(1, raw));
      this.pendingLength += 1;
      if (this.pendingLength === this.windowSize) {
        const windowTimestamp = timestamp + result.length * (this.windowSize / this.sampleRate) * 1000;
        result.push(this.analyze(this.pending, windowTimestamp));
        this.pendingLength = 0;
      }
    }
    return result;
  }

  analyze(samples: ArrayLike<number>, timestamp = performance.now()): AudioFeatures {
    if (!samples.length) return { timestamp, rms: 0, peak: 0, zeroCrossingRate: 0, spectralCentroid: 0, lowBandRatio: 1 };
    let sumSquares = 0;
    let peak = 0;
    let crossings = 0;
    let previous = samples[0] ?? 0;

    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i] ?? 0;
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if (i > 0 && (sample >= 0) !== (previous >= 0)) crossings += 1;
      previous = sample;
    }

    const zeroCrossingRate = crossings / Math.max(1, samples.length - 1);
    return {
      timestamp,
      rms: Math.sqrt(sumSquares / samples.length),
      peak,
      zeroCrossingRate,
      spectralCentroid: zeroCrossingRate * (this.sampleRate / 2),
      lowBandRatio: Math.max(0, Math.min(1, 1 - zeroCrossingRate / 0.18)),
    };
  }

  reset(): void {
    this.pendingLength = 0;
  }
}
