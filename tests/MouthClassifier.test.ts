import { describe, expect, it } from "vitest";
import { MouthClassifier } from "../src/audio/MouthClassifier";
import type { AudioFeatures } from "../src/core/types";

const features = (timestamp: number, rms: number, spectralCentroid = 1000, lowBandRatio = 0.5): AudioFeatures => ({ timestamp, rms, peak: rms, zeroCrossingRate: 0.05, spectralCentroid, lowBandRatio });

describe("MouthClassifier", () => {
  it("classifies loud input as large", () => {
    const classifier = new MouthClassifier({ minStateDurationMs: 0 });
    expect(classifier.update(features(100, 0.4)).mouth).toBe("large");
  });

  it("closes after the silence delay", () => {
    const classifier = new MouthClassifier({ minStateDurationMs: 0, silenceDelayMs: 80 });
    expect(classifier.update(features(0, 0.1)).mouth).toBe("small");
    expect(classifier.update(features(20, 0)).mouth).toBe("small");
    expect(classifier.update(features(101, 0)).mouth).toBe("closed");
  });

  it("holds rapid changes for the minimum duration", () => {
    const classifier = new MouthClassifier({ minStateDurationMs: 50 });
    expect(classifier.update(features(0, 0.1)).mouth).toBe("small");
    expect(classifier.update(features(20, 0.4)).mouth).toBe("small");
    expect(classifier.update(features(60, 0.4)).mouth).toBe("large");
  });
});
