import { describe, expect, it } from "vitest";
import type { CanonicalGameData } from "../game-data/types";
import { gameDataV3 } from "../game-data/load";
import { deterministicExplanationV63, parseAnalysisCommandV64, parseDeterministicIntentV63, parseKoreanNumberV64, validateGroundedExplanationV63 } from "./grounding";
import type { IntelligenceResultV63 } from "./types";

const data = { tree: [{ id: "n" }] } as unknown as CanonicalGameData;
const result = {
  schemaVersion: 1, dataVersion: "1.1.0:hash", calculatedAt: "2026-09-10T00:00:00Z", goal: "basic-dps",
  primary: { id: "r", rankChanges: { n: 1 }, steps: [{ nodeId: "n", fromRank: 0, toRank: 1, cost: { gold: 1000, stone: 2 }, reason: "verified-gain" }], cost: { gold: 1000, stone: 2 }, remaining: { gold: 0, stone: 0 }, metrics: [{ id: "basic-attack-dps", before: 100, after: 110, absoluteGain: 10, percentGain: 10, confidence: "verified" }], confidence: "verified", sourceRefs: [], warnings: [], score: 10 },
  alternatives: [], paretoFront: [], overlay: { n: "next" }, breakpoint: { affordableNow: true, nextCost: null, shortage: { gold: 0, stone: 0 }, decision: "spend" },
  search: { algorithm: "exact-dfs-pareto", complete: true, horizon: 1, candidateNodeRanks: 1, visitedStates: 2, deduplicatedStates: 0, prunedDominated: 0, elapsedMs: 1, scope: "test" }, limitations: [],
} satisfies IntelligenceResultV63;

describe("local explanation grounding", () => {
  it("parses intent without requiring a model", () => {
    expect(parseDeterministicIntentV63("효율 기준으로 다음 3개를 비교해줘")).toMatchObject({ tool: "compare_routes", goal: "resource-efficiency", maxPurchases: 3 });
  });

  it("parses Korean units, resource deltas, horizons, modes, and localized dice without AI", () => {
    expect(parseKoreanNumberV64("20만")).toBe(200_000);
    expect(parseKoreanNumberV64("1.5만")).toBe(15_000);
    expect(parseAnalysisCommandV64("코어 100개 더 있고 다음 4개", gameDataV3)).toMatchObject({
      confidence: "high", maxPurchases: 4, resourceDelta: { stone: 100 },
    });
    expect(parseAnalysisCommandV64("골드 20만 협동 기준", gameDataV3)).toMatchObject({
      confidence: "high", goal: "coop", resourceOverride: { gold: 200_000 },
    });
    expect(parseAnalysisCommandV64("포식 덱 기준으로 다시 계산", gameDataV3)).toMatchObject({
      confidence: "high", targetDiceId: "predator",
    });
    expect(parseAnalysisCommandV64("포싯 기준", gameDataV3).targetDiceId).toBe("predator");
    expect(parseAnalysisCommandV64("노드 5007 대신 비교", gameDataV3).targetNodeId).toBe("5007");
    expect(parseAnalysisCommandV64("오른쪽은?", gameDataV3).confidence).toBe("ambiguous");
  });

  it("accepts only known node citations and authoritative numbers", () => {
    expect(validateGroundedExplanationV63("[node:n] 비용은 1,000 골드이고 증가는 10.00%입니다.", result, data).ok).toBe(true);
    expect(validateGroundedExplanationV63("[node:fake] 비용은 999 골드입니다.", result, data)).toMatchObject({ ok: false, reasons: ["unknown-node-citation", "ungrounded-number"] });
  });

  it("creates a deterministic fallback with internal citations", () => {
    const explanation = deterministicExplanationV63(result, "ko");
    expect(explanation).toContain("[node:n]");
    expect(explanation).toContain("1,000");
    expect(validateGroundedExplanationV63(explanation, result, data).ok).toBe(true);
  });
});
