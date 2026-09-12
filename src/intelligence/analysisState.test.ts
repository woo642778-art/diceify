import { describe, expect, it, vi } from "vitest";
import type { SimulationInputV3 } from "../simulation/engine/types";
import {
  analysisRequestFromStateV65,
  analysisRevisionIdV65,
  analysisStateReducerV65,
  createAnalysisStateV65,
  hasScenarioOverridesV65,
  selectEffectiveAnalysisV65,
  stableSerializeAnalysisRequestV65,
} from "./analysisState";

const input: SimulationInputV3 = {
  diceId: "predator", diceProgressionLevel: 1, battleUpgradeLevel: 1,
  treeRanks: { b: 1, a: 2 }, conditionValues: {}, enemy: { id: "custom", kind: "custom" }, durationSeconds: 30,
};

function state() {
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
  return createAnalysisStateV65({ input, resources: { gold: 100_000, stone: 378, solarCore: 0 }, deckIds: ["predator", "growth"], goal: "target-dice", purchaseLimit: 4 });
}

describe("authoritative Diceify analysis state", () => {
  it("keeps base state immutable while deriving a temporary scenario", () => {
    const base = state();
    const changed = analysisStateReducerV65(
      analysisStateReducerV65(base, { type: "add-resources", delta: { stone: 100 } }),
      { type: "set-purchase-limit", purchaseLimit: 8 },
    );
    expect(base.base.resources.stone).toBe(378);
    expect(selectEffectiveAnalysisV65(changed)).toMatchObject({ resources: { stone: 478 }, purchaseLimit: 8 });
    expect(hasScenarioOverridesV65(changed)).toBe(true);
    expect(selectEffectiveAnalysisV65(analysisStateReducerV65(changed, { type: "reset-scenario" }))).toMatchObject({ resources: { stone: 378 }, purchaseLimit: 4 });
  });

  it("applies one command atomically without changing the saved baseline", () => {
    const base = state();
    const changed = analysisStateReducerV65(base, { type: "apply-command", command: {
      tool: "calculate_route", goal: "coop", maxPurchases: 8, resourceDelta: { gold: 500_000, stone: 100 }, confidence: "high", matched: [],
    } });
    expect(selectEffectiveAnalysisV65(changed)).toMatchObject({ goal: "coop", purchaseLimit: 8, resources: { gold: 600_000, stone: 478 } });
    expect(base.base.goal).toBe("target-dice");
    expect(base.base.resources).toEqual({ gold: 100_000, stone: 378, solarCore: 0 });
  });

  it("uses stable normalized serialization for cache and revision keys", () => {
    const request = analysisRequestFromStateV65(state(), "1.1.0:hash");
    const reordered = { ...request, input: { ...request.input, treeRanks: { a: 2, b: 1 } } };
    expect(stableSerializeAnalysisRequestV65(reordered)).toBe(stableSerializeAnalysisRequestV65(request));
    expect(analysisRevisionIdV65(reordered)).toBe(analysisRevisionIdV65(request));
  });

  it("restores a saved request as overrides and can return exactly to base", () => {
    const base = state();
    const request = {
      ...analysisRequestFromStateV65(base, "1.1.0:hash"),
      input: { ...input, diceProgressionLevel: 7, treeRanks: { a: 1, c: 2 }, conditionValues: { stacks: 3 }, durationSeconds: 45 },
      goal: "basic-dps" as const, maxPurchases: 6, resources: { gold: 150_000, stone: 400, solarCore: 0 },
    };
    const restored = analysisStateReducerV65(base, { type: "restore-request", request });
    expect(selectEffectiveAnalysisV65(restored)).toMatchObject({ goal: "basic-dps", purchaseLimit: 6, resources: request.resources, input: request.input });
    expect(selectEffectiveAnalysisV65(analysisStateReducerV65(restored, { type: "reset-scenario" }))).toMatchObject({ goal: "target-dice", purchaseLimit: 4, resources: base.base.resources });
  });

  it("treats an explicitly empty deck as a real scenario override", () => {
    const base = state();
    const request = { ...analysisRequestFromStateV65(base, "1.1.0:hash"), activeDeckIds: [] };
    const restored = analysisStateReducerV65(base, { type: "restore-request", request });
    expect(selectEffectiveAnalysisV65(restored).deckIds).toEqual([]);
    expect(hasScenarioOverridesV65(restored)).toBe(true);
  });
});
