import { beforeEach, describe, expect, it } from "vitest";
import { deleteSavedIntelligenceV63, loadSavedIntelligenceV63, saveIntelligenceRecommendationV63 } from "./storage";
import type { SavedIntelligenceRecommendationV63 } from "./types";

const entry = {
  schemaVersion: 1,
  id: "saved-1",
  name: "test",
  savedAt: "2026-09-10T00:00:00Z",
  dataVersion: "1.1.0:hash",
  request: { schemaVersion: 1, dataVersion: "1.1.0:hash", input: { diceId: "a", diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {}, enemy: { id: "custom", kind: "custom" }, durationSeconds: 30 }, resources: { gold: 0, stone: 0 }, goal: "basic-dps", maxPurchases: 2, activeDeckIds: [] },
  result: { schemaVersion: 1, dataVersion: "1.1.0:hash", calculatedAt: "2026-09-10T00:00:00Z", goal: "basic-dps", primary: null, alternatives: [], paretoFront: [], overlay: {}, breakpoint: { affordableNow: false, nextCost: null, shortage: { gold: 0, stone: 0 }, decision: "no-verified-gain" }, search: { algorithm: "exact-dfs-pareto", complete: true, horizon: 2, candidateNodeRanks: 0, visitedStates: 1, deduplicatedStates: 0, prunedDominated: 0, elapsedMs: 0, scope: "test" }, limitations: [] },
} satisfies SavedIntelligenceRecommendationV63;

describe("versioned intelligence storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips and deletes a recommendation without changing its data version", () => {
    saveIntelligenceRecommendationV63(entry);
    expect(loadSavedIntelligenceV63()).toEqual([entry]);
    deleteSavedIntelligenceV63(entry.id);
    expect(loadSavedIntelligenceV63()).toEqual([]);
  });

  it("ignores malformed legacy records", () => {
    window.localStorage.setItem("diceify:intelligence:v1", JSON.stringify([{ id: "old" }]));
    expect(loadSavedIntelligenceV63()).toEqual([]);
  });
});
