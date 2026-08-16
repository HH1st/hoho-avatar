import { describe, expect, it } from "vitest";
import { PCMAnalyzer } from "../src/audio/PCMAnalyzer";

describe("PCMAnalyzer", () => {
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
});
