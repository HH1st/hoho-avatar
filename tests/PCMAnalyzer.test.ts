import { describe, expect, it } from "vitest";
import { PCMAnalyzer } from "../src/audio/PCMAnalyzer";

describe("PCMAnalyzer", () => {
  it('names zero-crossing heuristics explicitly rather than reporting spectral measurements', () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000 });
    const features = analyzer.analyze([1, -1, 1, -1]);
    expect(features.estimatedFrequencyHz).toBe(500);
    expect(features.roundnessScore).toBe(0);
    expect(features).not.toHaveProperty('spectralCentroid');
    expect(features).not.toHaveProperty('lowBandRatio');
    expect(() => new PCMAnalyzer({ sampleRate: NaN })).toThrow('finite');
    expect(() => new PCMAnalyzer({ sampleRate: 48_000, windowMs: Infinity })).toThrow('finite');
  });
  it("normalizes Int16 PCM and computes RMS", () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000, windowMs: 2 });
    const [features] = analyzer.push(new Int16Array([32767, -32768]), 10);
    expect(features?.rms).toBeCloseTo(1, 3);
    expect(features?.peak).toBeCloseTo(1, 3);
  });

  it("returns zero energy for silence", () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000, windowMs: 4 });
    expect(analyzer.analyze(new Float32Array(4)).rms).toBe(0);
  });

  it("discards pending samples when reset", () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000, windowMs: 4 });
    expect(analyzer.push(new Float32Array([1, 1]))).toEqual([]);
    analyzer.reset();
    expect(analyzer.push(new Float32Array([1, 1]))).toEqual([]);
  });

  it("assigns increasing timestamps to multiple windows from one chunk", () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000, windowMs: 2 });
    const frames = analyzer.push(new Float32Array(6), 10);
    expect(frames.map((frame) => frame.timestamp)).toEqual([10, 12, 14]);
  });
});
