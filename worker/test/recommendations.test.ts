import { describe, expect, it } from "vitest";
import { bayesianRate, combineRecommendationSignals, communitySignal } from "../src/domain/recommendations";

describe("community recommendation safeguards", () => {
  it("does not expose a score before the minimum sample is reached", () => {
    expect(communitySignal({ positive: 20, total: 24, weightedCount: 24 })).toEqual({
      eligible: false,
      score: null,
      confidence: "insufficient",
    });
  });

  it("shrinks small samples toward the neutral prior", () => {
    expect(bayesianRate(25, 25)).toBeCloseTo(35 / 45);
    expect(communitySignal({ positive: 25, total: 25, weightedCount: 20 })).toMatchObject({
      eligible: true,
      confidence: "low",
    });
  });

  it("never lets community feedback outweigh the canonical calculator", () => {
    const combined = combineRecommendationSignals({ canonicalScore: 0.8, communityScore: 0.1, communitySample: 1_000_000 });
    expect(combined.communityWeight).toBeLessThanOrEqual(0.45);
    expect(combined.canonicalWeight).toBeGreaterThanOrEqual(0.55);
    expect(combined.score).toBeGreaterThan(0.48);
  });
});
