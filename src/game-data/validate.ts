import type { CanonicalGameData, DiceTreeNodeV3, TreeCost } from "./types";

const COST_KEYS = new Set(["gold", "stone", "solarCore"]);

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function validateTreeCost(cost: TreeCost, nodeId: string, rankIndex: number) {
  const keys = Object.keys(cost as unknown as Record<string, unknown>);
  if (keys.some((key) => !COST_KEYS.has(key)) || !keys.includes("gold") || !keys.includes("stone")) {
    throw new Error(`Dice Tree costs must contain gold and stone, with optional solarCore (${nodeId} rank ${rankIndex + 1})`);
  }
  assertFiniteNonNegative(cost.gold, `${nodeId}.costsByRank[${rankIndex}].gold`);
  assertFiniteNonNegative(cost.stone, `${nodeId}.costsByRank[${rankIndex}].stone`);
  if (cost.solarCore !== undefined) {
    assertFiniteNonNegative(cost.solarCore, `${nodeId}.costsByRank[${rankIndex}].solarCore`);
  }
}

function validateNode(node: DiceTreeNodeV3, knownIds: Set<string>) {
  if (!node.id) throw new Error("Dice Tree node id is required");
  if (!Number.isInteger(node.maxRank) || node.maxRank < 0) {
    throw new Error(`${node.id}.maxRank must be a non-negative integer`);
  }

  const zeroCostRanks = new Set(node.zeroCostRanks ?? []);
  for (const rank of zeroCostRanks) {
    if (!Number.isInteger(rank) || rank < 1 || rank > node.maxRank) {
      throw new Error(`${node.id}.zeroCostRanks contains invalid rank ${rank}`);
    }
  }

  if (node.costsByRank.length !== node.maxRank) {
    throw new Error(`${node.id}.costsByRank length must equal maxRank; explicit zero-cost ranks still require { gold: 0, stone: 0 } entries`);
  }

  node.costsByRank.forEach((cost, index) => validateTreeCost(cost, node.id, index));

  for (const prerequisite of node.prerequisites) {
    if (!knownIds.has(prerequisite.nodeId)) {
      throw new Error(`${node.id} prerequisite references unknown node ${prerequisite.nodeId}`);
    }
    if (!Number.isInteger(prerequisite.minRank) || prerequisite.minRank < 0) {
      throw new Error(`${node.id} prerequisite minRank must be a non-negative integer`);
    }
  }
}

export function validateCanonicalGameData(input: CanonicalGameData): CanonicalGameData {
  if (!input || typeof input !== "object") throw new Error("Canonical game data is required");
  if (input.manifest?.schemaVersion !== 3) throw new Error("V3 canonical data requires schemaVersion 3");
  if (!Array.isArray(input.tree) || !Array.isArray(input.dice) || !Array.isArray(input.passives) || !Array.isArray(input.runes) || !Array.isArray(input.enemies)) {
    throw new Error("Canonical game data arrays are missing");
  }

  const ids = input.tree.map((node) => node.id);
  const knownIds = new Set(ids);
  if (knownIds.size !== ids.length) throw new Error("Duplicate Dice Tree node id detected");

  input.tree.forEach((node) => validateNode(node, knownIds));
  return input;
}
