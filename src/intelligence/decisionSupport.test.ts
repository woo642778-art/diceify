import { describe, expect, it } from "vitest";
import type { CanonicalGameData, DiceTreeNodeV3 } from "../game-data/types";
import type { TreeAwareSimulationResultV3 } from "../simulation/engine/simulateTreeAware";
import type { SimulationInputV3 } from "../simulation/engine/types";
import { analyzeDecisionSupportV65, compareCounterfactualV65, recommendationSummaryV65 } from "./decisionSupport";
import { optimizeIntelligenceRouteV63 } from "./optimizer";
import type { IntelligenceRequestV63 } from "./types";

function node(id: string, gold: number): DiceTreeNodeV3 {
  return { id, family: "chaos", kind: "perk", position: { x: 0, y: 0 }, prerequisites: [], targetId: "test-die", maxRank: 1, costsByRank: [{ gold, stone: 0 }], sourceRefs: [`test:${id}`] };
}
const data = {
  manifest: { schemaVersion: 3, clientVersion: "test", sourceSha256: "1234567890abcdef", extractorVersion: "test", extractedAt: "2026-09-12T00:00:00Z" },
  dice: [{ id: "test-die", family: "chaos", baseStats: { attack: 100, attackInterval: 1, extra: {} }, levelGrowth: [], battleUpgradeGrowth: [], sourceRefs: [] }],
  tree: [node("near", 10), node("strong", 20)], passives: [], runes: [], enemies: [], localization: { ko: {}, en: {} },
} satisfies CanonicalGameData;
const input: SimulationInputV3 = { diceId: "test-die", diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {}, enemy: { id: "custom", kind: "custom" }, durationSeconds: 30 };
const request: IntelligenceRequestV63 = { schemaVersion: 1, dataVersion: "test:1234567890ab", input, resources: { gold: 10, stone: 0, solarCore: 0 }, goal: "basic-dps", maxPurchases: 1, activeDeckIds: ["test-die"] };
const simulate = (next: SimulationInputV3): TreeAwareSimulationResultV3 => {
  const gain = next.treeRanks.strong ? 10 : next.treeRanks.near ? 5 : 0;
  return { diceId: next.diceId, stats: { attack: 100 + gain, attackInterval: 1 }, basicAttackDps: 100 + gain, practicalDps: 100 + gain, confidence: "verified", trace: [], unresolvedMechanics: [], unresolvedStats: [], tree: { unresolvedNodeIds: [] } };
};

describe("Diceify decision support", () => {
  it("finds the exact resource event that changes the optimal route", () => {
    const result = optimizeIntelligenceRouteV63(data, request, { simulate });
    const analysis = analyzeDecisionSupportV65(data, request, result, null, { simulate, optimize: (gameData, nextRequest) => optimizeIntelligenceRouteV63(gameData, nextRequest, { simulate }) });
    expect(result.primary?.steps[0].nodeId).toBe("near");
    expect(analysis.breakpoints).toMatchObject([{ resource: "gold", amount: 10, routeNodeIds: ["strong"] }]);
    expect(analysis.eventSearch.tested).toBeGreaterThan(0);
  });

  it("includes composite route costs instead of checking only single-node shortages", () => {
    const compositeData = { ...data, tree: [node("first", 6), node("second", 6), node("solo", 10)] };
    const compositeRequest = { ...request, resources: { gold: 10, stone: 0, solarCore: 0 }, maxPurchases: 2 };
    const compositeSimulation = (next: SimulationInputV3): TreeAwareSimulationResultV3 => {
      const gain = next.treeRanks.first && next.treeRanks.second ? 20 : next.treeRanks.solo ? 10 : next.treeRanks.first || next.treeRanks.second ? 1 : 0;
      return { diceId: next.diceId, stats: { attack: 100 + gain, attackInterval: 1 }, basicAttackDps: 100 + gain, practicalDps: 100 + gain, confidence: "verified", trace: [], unresolvedMechanics: [], unresolvedStats: [], tree: { unresolvedNodeIds: [] } };
    };
    const optimize = (gameData: CanonicalGameData, nextRequest: IntelligenceRequestV63) => optimizeIntelligenceRouteV63(gameData, nextRequest, { simulate: compositeSimulation });
    const result = optimize(compositeData, compositeRequest);
    const analysis = analyzeDecisionSupportV65(compositeData, compositeRequest, result, null, { simulate: compositeSimulation, optimize });
    expect(result.primary?.steps.map((step) => step.nodeId)).toEqual(["solo"]);
    expect(analysis.breakpoints[0]).toMatchObject({ resource: "gold", amount: 2, routeNodeIds: ["first", "second"] });
  });

  it("separates stability from evidence confidence and records deck impact", () => {
    const result = optimizeIntelligenceRouteV63(data, request, { simulate });
    const analysis = analyzeDecisionSupportV65(data, request, result, null, { simulate, optimize: (gameData, nextRequest) => optimizeIntelligenceRouteV63(gameData, nextRequest, { simulate }) });
    expect(analysis.stability.level).toBe("low");
    expect(analysis.evidenceConfidence).toMatchObject({ level: "high", metaUsedInScore: false });
    expect(analysis.saveVsSpend.verdict).toBe("tradeoff");
    expect(analysis.contributions[0]).toMatchObject({ nodeId: "near", value: 5, metric: "practical-dps", affectedDeckDiceIds: ["test-die"] });
  });

  it("explains deterministic alternatives and produces a decision-first summary", () => {
    const result = optimizeIntelligenceRouteV63(data, { ...request, resources: { ...request.resources, gold: 20 } }, { simulate });
    const alternative = result.alternatives.find((route) => route.steps[0].nodeId === "near")!;
    expect(compareCounterfactualV65(result.primary!, alternative)).toMatchObject({ verdict: "alternative-tradeoff", reason: "currency-tradeoff", scoreDelta: 5 });
    expect(recommendationSummaryV65(result, (id) => id, "ko")).toContain("strong");
  });
});
