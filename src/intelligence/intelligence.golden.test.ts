import { describe, expect, it } from "vitest";
import { gameDataV3 } from "../game-data/load";
import golden from "./fixtures/predator-v110-golden.json";
import { optimizeIntelligenceRouteV63 } from "./optimizer";

describe("Diceify Intelligence 1.1.0 golden fixture", () => {
  it("keeps the verified predator route stable for the recorded input", () => {
    expect(gameDataV3.manifest.clientVersion).toBe(golden.clientVersion);
    const result = optimizeIntelligenceRouteV63(gameDataV3, {
      schemaVersion: 1,
      dataVersion: `${gameDataV3.manifest.clientVersion}:${gameDataV3.manifest.sourceSha256.slice(0, 12)}`,
      input: { diceId: golden.diceId, diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {}, enemy: { id: "custom", kind: "custom" }, durationSeconds: 30 },
      resources: golden.resources,
      goal: golden.goal as "target-dice",
      maxPurchases: golden.maxPurchases,
      activeDeckIds: [golden.diceId],
    }, { now: () => 1 });
    expect(result.primary?.steps.map((step) => [step.nodeId, step.toRank])).toEqual(golden.expected.route);
    expect(result.primary?.cost).toEqual(golden.expected.cost);
    expect(result.primary?.remaining).toEqual(golden.expected.remaining);
    expect(result.breakpoint.decision).toBe(golden.expected.decision);
    expect(result.search.complete).toBe(golden.expected.complete);
  });
});
