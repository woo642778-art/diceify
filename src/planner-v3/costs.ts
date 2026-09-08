import type { DiceTreeNodeV3, TreeCost } from "../game-data/types";
import type { PlannerStateV3 } from "./types";

export interface ResourceProjectionV3 {
  spent: TreeCost;
  remaining: TreeCost;
  shortage: TreeCost;
  affordable: boolean;
}

export const ZERO_TREE_COST: TreeCost = Object.freeze({ gold: 0, stone: 0 });

export function addTreeCosts(left: TreeCost, right: TreeCost): TreeCost {
  const solarCore = (left.solarCore ?? 0) + (right.solarCore ?? 0);
  return {
    gold: left.gold + right.gold,
    stone: left.stone + right.stone,
    ...(solarCore > 0 ? { solarCore } : {}),
  };
}

export function treeCostForRange(
  node: DiceTreeNodeV3,
  fromRank: number,
  toRank: number,
): TreeCost {
  if (
    !Number.isInteger(fromRank)
    || !Number.isInteger(toRank)
    || fromRank < 0
    || toRank < fromRank
    || toRank > node.maxRank
  ) {
    throw new RangeError(
      `Invalid Dice Tree rank range for ${node.id}: ${fromRank} -> ${toRank} (max ${node.maxRank})`,
    );
  }

  let total: TreeCost = { ...ZERO_TREE_COST };
  for (let rankIndex = fromRank; rankIndex < toRank; rankIndex += 1) {
    const cost = node.costsByRank[rankIndex];
    if (!cost) {
      throw new Error(`Missing exact rank cost for ${node.id}: ${rankIndex} -> ${rankIndex + 1}`);
    }
    total = addTreeCosts(total, cost);
  }
  return total;
}

export function nextRankCost(
  node: DiceTreeNodeV3,
  currentRank: number,
): TreeCost | null {
  if (!Number.isInteger(currentRank) || currentRank < 0 || currentRank > node.maxRank) {
    throw new RangeError(`Invalid current rank for ${node.id}: ${currentRank}`);
  }
  return currentRank === node.maxRank ? null : treeCostForRange(node, currentRank, currentRank + 1);
}

export function simulatedInvestmentCost(
  nodes: readonly DiceTreeNodeV3[],
  state: Pick<PlannerStateV3, "ownedRanks" | "simulatedRanks">,
): TreeCost {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let total: TreeCost = { ...ZERO_TREE_COST };

  for (const [nodeId, targetRank] of Object.entries(state.simulatedRanks)) {
    const node = byId.get(nodeId);
    if (!node) throw new Error(`Unknown simulated Dice Tree node: ${nodeId}`);
    const ownedRank = state.ownedRanks[nodeId] ?? 0;
    if (targetRank <= ownedRank) continue;
    total = addTreeCosts(total, treeCostForRange(node, ownedRank, targetRank));
  }
  return total;
}

export function projectResources(
  inventory: PlannerStateV3["inventory"],
  spent: TreeCost,
): ResourceProjectionV3 {
  const hasSolarCore = inventory.solarCore !== undefined || spent.solarCore !== undefined;
  const remaining: TreeCost = {
    gold: inventory.gold - spent.gold,
    stone: inventory.stone - spent.stone,
    ...(hasSolarCore ? { solarCore: (inventory.solarCore ?? 0) - (spent.solarCore ?? 0) } : {}),
  };
  const shortage: TreeCost = {
    gold: Math.max(0, -remaining.gold),
    stone: Math.max(0, -remaining.stone),
    ...(hasSolarCore ? { solarCore: Math.max(0, -(remaining.solarCore ?? 0)) } : {}),
  };
  return {
    spent: { ...spent },
    remaining,
    shortage,
    affordable: shortage.gold === 0 && shortage.stone === 0 && (shortage.solarCore ?? 0) === 0,
  };
}
