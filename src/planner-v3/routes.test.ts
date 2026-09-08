import { describe, expect, it } from "vitest";
import { gameDataV3 } from "../game-data/load";
import type { DiceTreeNodeV3 } from "../game-data/types";
import { addTreeCosts, treeCostForRange, ZERO_TREE_COST } from "./costs";
import { planNextRankRouteV3, planNodeRankRouteV3 } from "./routes";

const root: DiceTreeNodeV3 = {
  id: "root",
  family: "core",
  kind: "passive",
  position: { x: 0, y: 0 },
  prerequisites: [],
  maxRank: 2,
  costsByRank: [
    { gold: 100, stone: 0 },
    { gold: 200, stone: 1 },
  ],
  sourceRefs: [],
};
const child: DiceTreeNodeV3 = {
  id: "child",
  family: "chaos",
  kind: "perk",
  position: { x: 1, y: 0 },
  prerequisites: [{ nodeId: "root", minRank: 2 }],
  maxRank: 1,
  costsByRank: [{ gold: 1000, stone: 2 }],
  sourceRefs: [],
};

describe("Dice Tree routes", () => {
  it("orders missing prerequisites before the target and totals exact client costs", () => {
    const route = planNextRankRouteV3([root, child], {}, "child");
    expect(
      route?.steps.map((step) => [step.nodeId, step.fromRank, step.toRank]),
    ).toEqual([
      ["root", 0, 2],
      ["child", 0, 1],
    ]);
    expect(route?.targetRanks).toEqual({ root: 2, child: 1 });
    expect(route?.prerequisiteCost).toEqual({ gold: 300, stone: 1 });
    expect(route?.totalCost).toEqual({ gold: 1300, stone: 3 });
  });

  it("charges only ranks that are still missing", () => {
    const route = planNodeRankRouteV3([root, child], { root: 1 }, "child", 1);
    expect(route.steps[0]).toMatchObject({
      nodeId: "root",
      fromRank: 1,
      toRank: 2,
    });
    expect(route.totalCost).toEqual({ gold: 1200, stone: 3 });
  });

  it("rejects a prerequisite cycle instead of producing an invalid route", () => {
    expect(() =>
      planNodeRankRouteV3(
        [{ ...root, prerequisites: [{ nodeId: "child", minRank: 1 }] }, child],
        {},
        "child",
        1,
      ),
    ).toThrow(/cycle/);
  });

  it("produces prerequisite-complete, exact-cost routes for every canonical node", () => {
    const byId = new Map(gameDataV3.tree.map((node) => [node.id, node]));
    for (const node of gameDataV3.tree) {
      const route = planNextRankRouteV3(gameDataV3.tree, {}, node.id);
      expect(route, node.id).not.toBeNull();
      for (const [nodeId, rank] of Object.entries(route!.targetRanks)) {
        const routeNode = byId.get(nodeId)!;
        for (const prerequisite of routeNode.prerequisites) {
          expect(
            route!.targetRanks[prerequisite.nodeId] ?? 0,
            `${nodeId} -> ${prerequisite.nodeId}`,
          ).toBeGreaterThanOrEqual(prerequisite.minRank);
        }
        expect(rank).toBeLessThanOrEqual(routeNode.maxRank);
      }
      const exact = route!.steps.reduce(
        (total, step) => {
          const cost = treeCostForRange(
            byId.get(step.nodeId)!,
            step.fromRank,
            step.toRank,
          );
          return addTreeCosts(total, cost);
        },
        { ...ZERO_TREE_COST },
      );
      expect(route!.totalCost, node.id).toEqual(exact);
      expect(route!.steps.at(-1)?.nodeId, node.id).toBe(node.id);
    }
  });

  it("routes the Atomic Dice node through every required predecessor", () => {
    const atomic = gameDataV3.tree.find(
      (node) => node.targetId === "element" && node.kind === "dice",
    );
    expect(atomic?.id).toBe("2004");
    const route = planNextRankRouteV3(gameDataV3.tree, {}, atomic!.id);
    expect(route?.steps.at(-1)).toMatchObject({ nodeId: "2004", target: true });
    expect(route?.steps.length).toBeGreaterThan(1);
    for (const prerequisite of atomic!.prerequisites) {
      expect(route?.targetRanks[prerequisite.nodeId]).toBeGreaterThanOrEqual(
        prerequisite.minRank,
      );
    }
  });
});
