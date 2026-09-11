import { describe, expect, it } from "vitest";
import type { CanonicalGameData, DiceTreeNodeV3 } from "../game-data/types";
import type { TreeAwareSimulationResultV3 } from "../simulation/engine/simulateTreeAware";
import type { SimulationInputV3 } from "../simulation/engine/types";
import { compareIntelligenceRoutesV63, optimizeIntelligenceRouteV63 } from "./optimizer";
import type { IntelligenceRequestV63 } from "./types";

function node(id: string, gold: number, prerequisites: DiceTreeNodeV3["prerequisites"] = [], stone = 0, solarCore = 0): DiceTreeNodeV3 {
  return {
    id, family: "chaos", kind: "perk", position: { x: 0, y: 0 }, prerequisites,
    targetId: "test-die", maxRank: 1, costsByRank: [{ gold, stone, solarCore }], sourceRefs: [`ipa-table:${id}`],
  };
}

function fixture(nodes: DiceTreeNodeV3[]): CanonicalGameData {
  return {
    manifest: { schemaVersion: 3, clientVersion: "test", sourceSha256: "1234567890abcdef", extractorVersion: "test", extractedAt: "2026-09-10T00:00:00Z" },
    dice: [{ id: "test-die", baseStats: { attack: 100, attackInterval: 1, extra: {} }, levelGrowth: [], battleUpgradeGrowth: [], sourceRefs: [] }],
    tree: nodes, passives: [], runes: [], enemies: [], localization: { ko: {}, en: {} },
  };
}

const input: SimulationInputV3 = {
  diceId: "test-die", diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {},
  enemy: { id: "custom", kind: "custom" }, durationSeconds: 30,
};

function request(overrides: Partial<IntelligenceRequestV63> = {}): IntelligenceRequestV63 {
  return {
    schemaVersion: 1, dataVersion: "test:1234567890ab", input,
    resources: { gold: 100, stone: 100, solarCore: 100 }, goal: "basic-dps", maxPurchases: 3, activeDeckIds: [], ...overrides,
  };
}

function simulation(score: (ranks: Record<string, number>) => number) {
  return (next: SimulationInputV3): TreeAwareSimulationResultV3 => {
    const dps = 100 + score(next.treeRanks);
    return {
      diceId: next.diceId, stats: { attack: dps, attackInterval: 1 }, basicAttackDps: dps, practicalDps: dps,
      confidence: "verified", trace: [], unresolvedMechanics: [], unresolvedStats: [], tree: { unresolvedNodeIds: [] },
    };
  };
}

describe("Diceify deterministic intelligence optimizer", () => {
  it("allows a zero-cost route with zero resources", () => {
    const result = optimizeIntelligenceRouteV63(fixture([node("free", 0)]), request({ resources: { gold: 0, stone: 0, solarCore: 0 }, maxPurchases: 1 }), { simulate: simulation((ranks) => ranks.free ? 5 : 0) });
    expect(result.primary?.steps.map((step) => step.nodeId)).toEqual(["free"]);
    expect(result.primary?.cost).toEqual({ gold: 0, stone: 0 });
  });

  it("accepts an exact budget and preserves all three currencies", () => {
    const solar = node("solar", 20, [], 3, 2);
    const result = optimizeIntelligenceRouteV63(fixture([solar]), request({ resources: { gold: 20, stone: 3, solarCore: 2 }, maxPurchases: 1 }), { simulate: simulation((ranks) => ranks.solar ? 10 : 0) });
    expect(result.primary?.cost).toEqual({ gold: 20, stone: 3, solarCore: 2 });
    expect(result.primary?.remaining).toEqual({ gold: 0, stone: 0, solarCore: 0 });
  });

  it("never emits a route with an unmet prerequisite", () => {
    const result = optimizeIntelligenceRouteV63(fixture([node("child", 1, [{ nodeId: "missing", minRank: 1 }])]), request(), { simulate: simulation(() => 10) });
    expect(result.primary).toBeNull();
  });

  it("orders prerequisites before a dependent node", () => {
    const result = optimizeIntelligenceRouteV63(fixture([node("root", 2), node("child", 3, [{ nodeId: "root", minRank: 1 }])]), request({ maxPurchases: 2 }), { simulate: simulation((ranks) => ranks.child ? 20 : 0) });
    expect(result.primary?.steps.map((step) => step.nodeId)).toEqual(["root", "child"]);
    expect(result.primary?.cost.gold).toBe(5);
  });

  it("does not repurchase owned ranks and uses the requested horizon for target progress", () => {
    const rankedRoot = { ...node("root", 2), maxRank: 2, costsByRank: [{ gold: 2, stone: 0 }, { gold: 3, stone: 0 }] };
    const data = fixture([rankedRoot, node("child", 3, [{ nodeId: "root", minRank: 2 }])]);
    const ownedInput = { ...input, treeRanks: { root: 1 } };
    const result = optimizeIntelligenceRouteV63(data, request({ input: ownedInput, goal: "target-dice", maxPurchases: 2 }), { simulate: simulation((ranks) => Object.values(ranks).reduce((sum, rank) => sum + rank, 0)) });
    expect(result.primary?.steps).toMatchObject([{ nodeId: "root", fromRank: 1, toRank: 2 }, { nodeId: "child", fromRank: 0, toRank: 1 }]);
    expect(result.primary?.remaining.gold).toBeGreaterThanOrEqual(0);
  });

  it("uses stable node-id ordering for equal outcomes", () => {
    const result = optimizeIntelligenceRouteV63(fixture([node("b", 5), node("a", 5)]), request({ maxPurchases: 1 }), { simulate: simulation((ranks) => ranks.a || ranks.b ? 5 : 0) });
    expect(result.primary?.steps[0].nodeId).toBe("a");
  });

  it("finds a globally better path in a greedy trap", () => {
    const data = fixture([node("a", 5), node("b", 2), node("c", 3, [{ nodeId: "b", minRank: 1 }])]);
    const simulate = simulation((ranks) => ranks.c ? 12 : (ranks.a ? 6 : 0) + (ranks.b ? 4 : 0));
    const result = optimizeIntelligenceRouteV63(data, request({ resources: { gold: 5, stone: 0 }, maxPurchases: 2 }), { simulate });
    expect(result.primary?.steps.map((step) => step.nodeId)).toEqual(["b", "c"]);
    expect(result.primary?.metrics.find((metric) => metric.id === "practical-dps")?.percentGain).toBe(12);
  });

  it("keeps every currency independent for the resource-efficiency Pareto front", () => {
    const data = fixture([node("cheap", 1), node("strong", 10)]);
    const simulate = simulation((ranks) => ranks.strong ? 8 : ranks.cheap ? 4 : 0);
    const efficiency = optimizeIntelligenceRouteV63(data, request({ goal: "resource-efficiency", maxPurchases: 1 }), { simulate });
    expect(efficiency.primary?.steps[0].nodeId).toBe("strong");
    expect(efficiency.paretoFront.map((route) => route.steps[0].nodeId)).toEqual(["strong", "cheap"]);
    expect(efficiency.limitations.join(" ")).toContain("임의 환산율");
  });

  it("does not substitute generic DPS for an unverified mode-specific score", () => {
    const data = fixture([node("a", 1)]);
    const result = optimizeIntelligenceRouteV63(data, request({ goal: "pvp", maxPurchases: 1 }), { simulate: simulation(() => 20) });
    expect(result.primary?.score).toBeNull();
    expect(result.breakpoint.decision).toBe("no-verified-gain");
    expect(result.limitations.join(" ")).toContain("모드 전용 점수");
  });

  it("removes dominated routes from the Pareto front", () => {
    const data = fixture([node("better", 2), node("worse", 4)]);
    const result = optimizeIntelligenceRouteV63(data, request({ maxPurchases: 1 }), { simulate: simulation((ranks) => ranks.better || ranks.worse ? 5 : 0) });
    expect(result.paretoFront.map((route) => route.steps[0].nodeId)).toEqual(["better"]);
  });

  it("does not invent a score when simulation has no calculable metric", () => {
    const partial = (): TreeAwareSimulationResultV3 => ({ diceId: "test-die", stats: {}, basicAttackDps: null, practicalDps: null, confidence: "partial", trace: [], unresolvedMechanics: ["unknown"], unresolvedStats: [], tree: { unresolvedNodeIds: [] } });
    const result = optimizeIntelligenceRouteV63(fixture([node("unknown", 1)]), request({ maxPurchases: 1 }), { simulate: partial });
    expect(result.primary?.score).toBeNull();
    expect(result.limitations).toContain("검증된 성능 증가를 계산할 수 없어 비용 순서만 제시합니다.");
  });

  it("computes route comparisons without mixing currencies", () => {
    const data = fixture([node("a", 2, [], 1), node("b", 3, [], 0, 2)]);
    const result = optimizeIntelligenceRouteV63(data, request({ maxPurchases: 1 }), { simulate: simulation((ranks) => ranks.a || ranks.b ? 5 : 0) });
    expect(result.primary && result.alternatives[0] && compareIntelligenceRoutesV63(result.primary, result.alternatives[0])).toMatchObject({ goldDelta: -1, stoneDelta: 1, solarCoreDelta: -2 });
  });

  it("rejects stale data, invalid resources, and invalid horizons", () => {
    const data = fixture([node("a", 1)]);
    expect(() => optimizeIntelligenceRouteV63(data, request({ dataVersion: "stale" }))).toThrow(/dataVersion/);
    expect(() => optimizeIntelligenceRouteV63(data, request({ resources: { gold: -1, stone: 0 } }))).toThrow(/resources/);
    expect(() => optimizeIntelligenceRouteV63(data, request({ maxPurchases: 9 }))).toThrow(/maxPurchases/);
  });

  it("reports deterministic search evidence and never overspends", () => {
    let tick = 10;
    const result = optimizeIntelligenceRouteV63(fixture([node("a", 2), node("b", 3)]), request({ resources: { gold: 4, stone: 0 }, maxPurchases: 2 }), { simulate: simulation((ranks) => Object.keys(ranks).length), now: () => tick++ });
    expect(result.search).toMatchObject({ algorithm: "exact-dfs-pareto", complete: true, horizon: 2, elapsedMs: 1, deduplicatedStates: 0 });
    for (const route of [result.primary, ...result.alternatives].filter(Boolean)) expect(route!.cost.gold).toBeLessThanOrEqual(4);
  });

  it("discloses when the safety cap prevents an optimality proof", () => {
    const data = fixture([node("a", 1), node("b", 1), node("c", 1)]);
    const result = optimizeIntelligenceRouteV63(data, request({ maxPurchases: 3 }), { simulate: simulation((ranks) => Object.keys(ranks).length), maxVisitedStates: 2 });
    expect(result.search.complete).toBe(false);
    expect(result.search.visitedStates).toBe(2);
    expect(result.limitations.join(" ")).toContain("현재 최선 후보");
  });
});
