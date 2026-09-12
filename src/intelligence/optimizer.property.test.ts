import { describe, expect, it } from "vitest";
import type { CanonicalGameData, DiceTreeNodeV3 } from "../game-data/types";
import type { TreeAwareSimulationResultV3 } from "../simulation/engine/simulateTreeAware";
import type { SimulationInputV3 } from "../simulation/engine/types";
import { optimizeIntelligenceRouteV63 } from "./optimizer";
import type { IntelligenceRequestV63 } from "./types";

function random(seed: number) {
  let state = seed >>> 0;
  return () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 0x1_0000_0000);
}

function makeCase(seed: number) {
  const next = random(seed);
  const gains: Record<string, number> = {};
  const tree: DiceTreeNodeV3[] = Array.from({ length: 5 }, (_, index) => {
    const id = `n${index}`;
    gains[id] = 1 + Math.floor(next() * 30);
    return {
      id, family: "chaos", kind: "perk", position: { x: index, y: 0 }, prerequisites: [], targetId: "test-die", maxRank: 1,
      costsByRank: [{ gold: Math.floor(next() * 21), stone: Math.floor(next() * 7), solarCore: Math.floor(next() * 4) }], sourceRefs: [`property:${seed}:${id}`],
    };
  });
  const data: CanonicalGameData = {
    manifest: { schemaVersion: 3, clientVersion: "test", sourceSha256: "1234567890abcdef", extractorVersion: "property", extractedAt: "2026-09-12T00:00:00Z" },
    dice: [{ id: "test-die", baseStats: { attack: 100, attackInterval: 1, extra: {} }, levelGrowth: [], battleUpgradeGrowth: [], sourceRefs: [] }],
    tree, passives: [], runes: [], enemies: [], localization: { ko: {}, en: {} },
  };
  const input: SimulationInputV3 = { diceId: "test-die", diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {}, enemy: { id: "custom", kind: "custom" }, durationSeconds: 30 };
  const simulate = (candidate: SimulationInputV3): TreeAwareSimulationResultV3 => {
    const gain = Object.entries(candidate.treeRanks).reduce((sum, [id, rank]) => sum + (gains[id] ?? 0) * rank, 0);
    return { diceId: candidate.diceId, stats: { attack: 100 + gain, attackInterval: 1 }, basicAttackDps: 100 + gain, practicalDps: 100 + gain, confidence: "verified", trace: [], unresolvedMechanics: [], unresolvedStats: [], tree: { unresolvedNodeIds: [] } };
  };
  const resources = { gold: Math.floor(next() * 35), stone: Math.floor(next() * 12), solarCore: Math.floor(next() * 7) };
  const request: IntelligenceRequestV63 = { schemaVersion: 1, dataVersion: "test:1234567890ab", input, resources, goal: "basic-dps", maxPurchases: 3, activeDeckIds: ["test-die"] };
  return { data, request, simulate };
}

describe("Diceify optimizer boundary properties", () => {
  it("never overspends any independent currency across seeded cases", () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const { data, request, simulate } = makeCase(seed);
      const result = optimizeIntelligenceRouteV63(data, request, { simulate, now: () => 1 });
      for (const route of [result.primary, ...result.alternatives].filter(Boolean)) {
        expect(route!.cost.gold).toBeLessThanOrEqual(request.resources.gold);
        expect(route!.cost.stone).toBeLessThanOrEqual(request.resources.stone);
        expect(route!.cost.solarCore ?? 0).toBeLessThanOrEqual(request.resources.solarCore ?? 0);
        expect(route!.remaining.gold).toBeGreaterThanOrEqual(0);
        expect(route!.remaining.stone).toBeGreaterThanOrEqual(0);
        expect(route!.remaining.solarCore ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("cannot reduce the best verified score when every resource only increases", () => {
    for (let seed = 65; seed <= 112; seed += 1) {
      const { data, request, simulate } = makeCase(seed);
      const lower = optimizeIntelligenceRouteV63(data, request, { simulate, now: () => 1 });
      const higher = optimizeIntelligenceRouteV63(data, { ...request, resources: { gold: request.resources.gold + 10, stone: request.resources.stone + 4, solarCore: (request.resources.solarCore ?? 0) + 2 } }, { simulate, now: () => 1 });
      if (lower.primary?.score !== null && lower.primary?.score !== undefined) expect(higher.primary?.score ?? -Infinity).toBeGreaterThanOrEqual(lower.primary.score);
    }
  });

  it("returns byte-equivalent deterministic decisions for an identical request", () => {
    for (let seed = 113; seed <= 128; seed += 1) {
      const { data, request, simulate } = makeCase(seed);
      const first = optimizeIntelligenceRouteV63(data, request, { simulate, now: () => 7 });
      const second = optimizeIntelligenceRouteV63(data, request, { simulate, now: () => 7 });
      const { calculatedAt: firstTimestamp, ...firstDecision } = first;
      const { calculatedAt: secondTimestamp, ...secondDecision } = second;
      expect(firstTimestamp).toBeTruthy();
      expect(secondTimestamp).toBeTruthy();
      expect(secondDecision).toEqual(firstDecision);
    }
  });
});
