import { analyzeDeckCompositionV4, replacementCandidatesV4 } from "../deck-lab/analyzeDeck";
import type { CanonicalGameData, TreeCost } from "../game-data/types";
import { addTreeCosts, ZERO_TREE_COST } from "../planner-v3/costs";
import { planNextRankRouteV3 } from "../planner-v3/routes";
import { recommendTreeInvestmentsV3 } from "./recommendV3";
import { simulateDiceWithTreeV3 } from "../simulation/engine/simulateTreeAware";
import type { SimulationInputV3 } from "../simulation/engine/types";

export type AccountActionKindV48 = "tree" | "deck" | "save" | "data-required";

export interface AccountActionV48 {
  id: string;
  kind: AccountActionKindV48;
  title: { ko: string; en: string };
  reason: { ko: string; en: string };
  gain: number;
  gainUnit: "percent-dps" | "deck-score" | "none";
  cost: TreeCost;
  confidence: "verified" | "partial" | "unavailable";
  dominated: boolean;
  payload?: { nodeId?: string; slot?: number; diceId?: string; targetRanks?: Record<string, number> };
}

function dominates(left: AccountActionV48, right: AccountActionV48) {
  if (left.gainUnit !== right.gainUnit || left.gainUnit === "none") return false;
  const noWorse = left.gain >= right.gain && left.cost.gold <= right.cost.gold && left.cost.stone <= right.cost.stone && (left.cost.solarCore ?? 0) <= (right.cost.solarCore ?? 0);
  const strictlyBetter = left.gain > right.gain || left.cost.gold < right.cost.gold || left.cost.stone < right.cost.stone;
  return noWorse && strictlyBetter;
}

export function optimizeNextActionsV48(input: SimulationInputV3, data: CanonicalGameData, deckIds: readonly string[], constraints: { bannedNodeIds?: readonly string[]; bannedDiceIds?: readonly string[]; lockedDiceIds?: readonly string[] } = {}): AccountActionV48[] {
  const bannedNodes = new Set(constraints.bannedNodeIds ?? []);
  const bannedDice = new Set(constraints.bannedDiceIds ?? []);
  const lockedDice = new Set(constraints.lockedDiceIds ?? []);
  const tree = recommendTreeInvestmentsV3(input, data, { limit: 12 }).verified
    .filter((entry) => !bannedNodes.has(entry.nodeId))
    .map((entry): AccountActionV48 => ({
      id: `tree:${entry.nodeId}`, kind: "tree", title: { ko: `노드 ${entry.nodeId} 투자`, en: `Invest in node ${entry.nodeId}` },
      reason: { ko: `선행 비용을 포함해 실전 DPS가 ${entry.percentGain?.toFixed(2)}% 증가합니다.`, en: `Practical DPS increases ${entry.percentGain?.toFixed(2)}%, including prerequisites.` },
      gain: entry.percentGain ?? 0, gainUnit: "percent-dps", cost: entry.totalRouteCost, confidence: "verified", dominated: false,
      payload: { nodeId: entry.nodeId, targetRanks: planNextRankRouteV3(data.tree, input.treeRanks, entry.nodeId)?.targetRanks },
    }));
  const deckBefore = analyzeDeckCompositionV4(data, deckIds).scores.overall;
  const deck = deckIds.flatMap((diceId, slot) => lockedDice.has(diceId) ? [] : replacementCandidatesV4(data, deckIds, slot, 2))
    .filter((entry) => !bannedDice.has(entry.toDiceId) && entry.delta > 0)
    .map((entry): AccountActionV48 => ({
      id: `deck:${entry.slot}:${entry.toDiceId}`, kind: "deck", title: { ko: `${entry.slot + 1}번 슬롯 교체`, en: `Replace slot ${entry.slot + 1}` },
      reason: { ko: `${entry.toDiceId}로 교체하면 덱 구성 점수가 ${deckBefore}에서 ${entry.after}로 변합니다.`, en: `Replacing with ${entry.toDiceId} changes composition score from ${deckBefore} to ${entry.after}.` },
      gain: entry.delta, gainUnit: "deck-score", cost: { ...ZERO_TREE_COST }, confidence: "partial", dominated: false,
      payload: { slot: entry.slot, diceId: entry.toDiceId },
    }));
  const explicitMissing: AccountActionV48 = {
    id: "data:dice-upgrade-cost", kind: "data-required", title: { ko: "주사위 강화 비용 데이터 필요", en: "Dice upgrade cost data required" },
    reason: { ko: "강화 비용표가 검증되지 않아 트리 투자와 같은 기준으로 순위를 매기지 않았습니다.", en: "Upgrade costs are not verified, so dice upgrades are excluded from the ranked frontier." },
    gain: 0, gainUnit: "none", cost: { ...ZERO_TREE_COST }, confidence: "unavailable", dominated: false,
  };
  const candidates = [...tree, ...deck];
  const ranked = candidates.map((candidate) => ({ ...candidate, dominated: candidates.some((other) => other.id !== candidate.id && dominates(other, candidate)) }))
    .sort((a, b) => Number(a.dominated) - Number(b.dominated) || b.gain - a.gain || a.cost.stone - b.cost.stone || a.cost.gold - b.cost.gold);
  return [...ranked, explicitMissing];
}

export interface ReversePlanStepV48 {
  order: number;
  nodeId: string;
  gainPercent: number;
  cumulativeGainPercent: number;
  cost: TreeCost;
  cumulativeCost: TreeCost;
  targetRanks: Record<string, number>;
}

export interface ReversePlanV48 {
  baselineDps: number | null;
  targetGainPercent: number;
  achievedGainPercent: number;
  reached: boolean;
  steps: ReversePlanStepV48[];
  totalCost: TreeCost;
  stopReason: "target" | "budget" | "unverified" | "search-limit";
  evaluatedRounds: number;
}

export function solveTargetPerformanceV48(baseInput: SimulationInputV3, data: CanonicalGameData, options: { targetGainPercent: number; budget: TreeCost; bannedNodeIds?: readonly string[]; maxSteps?: number }): ReversePlanV48 {
  const baseline = simulateDiceWithTreeV3(baseInput, data).practicalDps;
  if (baseline === null) return { baselineDps: null, targetGainPercent: options.targetGainPercent, achievedGainPercent: 0, reached: false, steps: [], totalCost: { ...ZERO_TREE_COST }, stopReason: "unverified", evaluatedRounds: 0 };
  const banned = new Set(options.bannedNodeIds ?? []);
  const ranks = { ...baseInput.treeRanks };
  let totalCost: TreeCost = { ...ZERO_TREE_COST };
  const steps: ReversePlanStepV48[] = [];
  const maxSteps = Math.max(1, Math.min(16, options.maxSteps ?? 8));
  let currentDps = baseline;
  let stopReason: ReversePlanV48["stopReason"] = "search-limit";
  for (let round = 0; round < maxSteps; round += 1) {
    const recommendations = recommendTreeInvestmentsV3({ ...baseInput, treeRanks: ranks }, data, { limit: 24 }).verified
      .filter((entry) => !banned.has(entry.nodeId) && entry.percentGain !== undefined && entry.percentGain > 0)
      .filter((entry) => totalCost.gold + entry.totalRouteCost.gold <= options.budget.gold
        && totalCost.stone + entry.totalRouteCost.stone <= options.budget.stone
        && (totalCost.solarCore ?? 0) + (entry.totalRouteCost.solarCore ?? 0) <= (options.budget.solarCore ?? 0));
    const best = recommendations.sort((a, b) => {
      const aUnits = Math.max(1, a.totalRouteCost.gold / 10_000 + a.totalRouteCost.stone * 10 + (a.totalRouteCost.solarCore ?? 0) * 10);
      const bUnits = Math.max(1, b.totalRouteCost.gold / 10_000 + b.totalRouteCost.stone * 10 + (b.totalRouteCost.solarCore ?? 0) * 10);
      return (b.percentGain! / bUnits) - (a.percentGain! / aUnits) || b.percentGain! - a.percentGain!;
    })[0];
    if (!best) { stopReason = "budget"; break; }
    const exactRoute = planNextRankRouteV3(data.tree, ranks, best.nodeId);
    if (!exactRoute) break;
    Object.assign(ranks, exactRoute.targetRanks);
    const nextInput = { ...baseInput, treeRanks: ranks };
    const nextDps = simulateDiceWithTreeV3(nextInput, data).practicalDps;
    if (nextDps === null) { stopReason = "unverified"; break; }
    totalCost = addTreeCosts(totalCost, best.totalRouteCost);
    currentDps = nextDps;
    const cumulativeGainPercent = ((currentDps - baseline) / baseline) * 100;
    steps.push({ order: steps.length + 1, nodeId: best.nodeId, gainPercent: best.percentGain!, cumulativeGainPercent, cost: best.totalRouteCost, cumulativeCost: { ...totalCost }, targetRanks: { ...ranks } });
    if (cumulativeGainPercent >= options.targetGainPercent) { stopReason = "target"; break; }
  }
  const achievedGainPercent = ((currentDps - baseline) / baseline) * 100;
  return { baselineDps: baseline, targetGainPercent: options.targetGainPercent, achievedGainPercent, reached: achievedGainPercent >= options.targetGainPercent, steps, totalCost, stopReason, evaluatedRounds: steps.length };
}

export interface BudgetScenarioV48 { core: number; plan: ReversePlanV48 }

export function compareCoreBudgetsV48(input: SimulationInputV3, data: CanonicalGameData, gold: number, targetGainPercent = 25): BudgetScenarioV48[] {
  return [100, 300, 500].map((core) => ({ core, plan: solveTargetPerformanceV48(input, data, { targetGainPercent, budget: { gold, stone: core }, maxSteps: 6 }) }));
}
