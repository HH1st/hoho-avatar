import { describe, expect, it } from "vitest";
import { MouthClassifier } from "../src/audio/MouthClassifier";
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

  it("treats NaN Float32 samples as silence instead of poisoning the window", () => {
    const analyzer = new PCMAnalyzer({ sampleRate: 1000, windowMs: 10 });
    const chunk = new Float32Array(10).fill(0.3);
    chunk[4] = NaN;
    const [features] = analyzer.push(chunk, 0);
    expect(Number.isFinite(features?.rms)).toBe(true);
    expect(Number.isFinite(features?.peak)).toBe(true);
    expect(features?.peak).toBeCloseTo(0.3, 5);
    const frame = new MouthClassifier().update(features!);
    expect(Number.isFinite(frame.energy)).toBe(true);
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
