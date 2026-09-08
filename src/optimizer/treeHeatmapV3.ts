import type { CanonicalGameData, TreeCost } from "../game-data/types";
import type { SimulationInputV3 } from "../simulation/engine/types";
import { evaluateNodeV3 } from "../simulation/marginal/evaluateNode";

export type TreeHeatmapModeV3 = "none" | "gold" | "stone" | "path";
export type TreeHeatmapGradeV3 = "S" | "A" | "B" | "C" | "?";

export interface TreeHeatmapEntryV3 {
  nodeId: string;
  mode: Exclude<TreeHeatmapModeV3, "none">;
  grade: TreeHeatmapGradeV3;
  value?: number;
  percentGain?: number;
  nodeCost: TreeCost;
  routeCost: TreeCost;
  confidence: "verified" | "partial";
  reason: "measured" | "partial-formula" | "zero-denominator";
}

function addCost(left: TreeCost, right: TreeCost): TreeCost {
  return { gold: left.gold + right.gold, stone: left.stone + right.stone, solarCore: (left.solarCore ?? 0) + (right.solarCore ?? 0) };
}

function gradeByPercentile(entries: TreeHeatmapEntryV3[]) {
  const ranked = entries.filter((entry) => entry.value !== undefined).sort((a, b) => b.value! - a.value! || a.nodeId.localeCompare(b.nodeId));
  ranked.forEach((entry, index) => {
    const fraction = (index + 1) / Math.max(1, ranked.length);
    entry.grade = fraction <= 0.15 ? "S" : fraction <= 0.45 ? "A" : fraction <= 0.75 ? "B" : "C";
  });
}

function dominates(a: TreeHeatmapEntryV3, b: TreeHeatmapEntryV3) {
  if (a.percentGain === undefined || b.percentGain === undefined) return false;
  const noWorse = a.percentGain >= b.percentGain && a.routeCost.gold <= b.routeCost.gold && a.routeCost.stone <= b.routeCost.stone && (a.routeCost.solarCore ?? 0) <= (b.routeCost.solarCore ?? 0);
  const better = a.percentGain > b.percentGain || a.routeCost.gold < b.routeCost.gold || a.routeCost.stone < b.routeCost.stone || (a.routeCost.solarCore ?? 0) < (b.routeCost.solarCore ?? 0);
  return noWorse && better;
}

function gradePareto(entries: TreeHeatmapEntryV3[]) {
  let remaining = entries.filter((entry) => entry.percentGain !== undefined);
  const grades: TreeHeatmapGradeV3[] = ["S", "A", "B", "C"];
  for (const grade of grades) {
    if (!remaining.length) break;
    const front = remaining.filter((candidate) => !remaining.some((other) => other !== candidate && dominates(other, candidate)));
    for (const entry of front) entry.grade = grade;
    const ids = new Set(front.map((entry) => entry.nodeId));
    remaining = remaining.filter((entry) => !ids.has(entry.nodeId));
  }
  for (const entry of remaining) entry.grade = "C";
}

export function buildTreeHeatmapV3(input: SimulationInputV3, data: CanonicalGameData, mode: TreeHeatmapModeV3): Map<string, TreeHeatmapEntryV3> {
  if (mode === "none") return new Map();
  const entries = data.tree
    .filter((node) => node.kind !== "connector" && (input.treeRanks[node.id] ?? 0) < node.maxRank)
    .map((node): TreeHeatmapEntryV3 => {
      try {
        const result = evaluateNodeV3(input, data, node.id);
        const routeCost = addCost(result.cost, result.prerequisiteCost);
        if (result.confidence !== "verified" || result.percentGain === undefined || result.percentGain <= 0) {
          return { nodeId: node.id, mode, grade: "?", nodeCost: result.cost, routeCost, confidence: "partial", reason: "partial-formula" };
        }
        const denominator = mode === "gold" ? result.cost.gold / 10_000 : mode === "stone" ? result.cost.stone : 1;
        const value = mode === "path" ? result.percentGain : denominator > 0 ? result.percentGain / denominator : undefined;
        return {
          nodeId: node.id, mode, grade: "?", ...(value !== undefined ? { value } : {}), percentGain: result.percentGain,
          nodeCost: result.cost, routeCost, confidence: "verified", reason: value === undefined ? "zero-denominator" : "measured",
        };
      } catch {
        return { nodeId: node.id, mode, grade: "?", nodeCost: { gold: 0, stone: 0 }, routeCost: { gold: 0, stone: 0 }, confidence: "partial", reason: "partial-formula" };
      }
    });
  if (mode === "path") gradePareto(entries);
  else gradeByPercentile(entries);
  return new Map(entries.map((entry) => [entry.nodeId, entry]));
}
