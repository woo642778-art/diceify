import type { CanonicalGameData, DiceTreeNodeV3, TreeCost } from "../game-data/types";
import { addTreeCosts, nextRankCost, ZERO_TREE_COST } from "../planner-v3/costs";
import { simulateDiceWithTreeV3 } from "../simulation/engine/simulateTreeAware";
import type { TreeAwareSimulationResultV3 } from "../simulation/engine/simulateTreeAware";
import type {
  IntelligenceMetricV63,
  IntelligenceRequestV63,
  IntelligenceResultV63,
  IntelligenceRouteStepV63,
  IntelligenceRouteV63,
} from "./types";

const EPSILON = 1e-9;
const MAX_VISITED_STATES = 50_000;

function subtractCost(resources: TreeCost, cost: TreeCost): TreeCost {
  return {
    gold: resources.gold - cost.gold,
    stone: resources.stone - cost.stone,
    solarCore: (resources.solarCore ?? 0) - (cost.solarCore ?? 0),
  };
}

function affordable(resources: TreeCost, cost: TreeCost) {
  return cost.gold <= resources.gold
    && cost.stone <= resources.stone
    && (cost.solarCore ?? 0) <= (resources.solarCore ?? 0);
}

function costKey(cost: TreeCost) {
  return `${cost.gold}:${cost.stone}:${cost.solarCore ?? 0}`;
}

function rankKey(ranks: Record<string, number>) {
  return Object.entries(ranks)
    .filter(([, rank]) => rank > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, rank]) => `${id}:${rank}`)
    .join("|");
}

function prerequisitesMet(node: DiceTreeNodeV3, ranks: Record<string, number>) {
  return node.prerequisites.every((entry) => (ranks[entry.nodeId] ?? 0) >= entry.minRank);
}

function candidateNodeIds(data: CanonicalGameData, request: IntelligenceRequestV63): Set<string> {
  const relevant = new Set<string>();
  const diceId = request.input.diceId;
  const byId = new Map(data.tree.map((node) => [node.id, node]));
  const includePrerequisites = (node: DiceTreeNodeV3) => {
    if (relevant.has(node.id)) return;
    relevant.add(node.id);
    for (const prerequisite of node.prerequisites) {
      const parent = byId.get(prerequisite.nodeId);
      if (parent) includePrerequisites(parent);
    }
  };

  for (const node of data.tree) {
    if (node.targetId === diceId) {
      includePrerequisites(node);
      continue;
    }
    const passive = node.passiveOrRuneRef
      ? data.passives.find((entry) => entry.id === node.passiveOrRuneRef)
      : undefined;
    const selectedFamily = data.dice.find((dice) => dice.id === diceId)?.family;
    const passiveApplies = passive && (passive.scope === "global"
      || passive.scope === selectedFamily
      || (passive.scope === "dice" && passive.targetDiceIds?.includes(diceId)));
    if (passiveApplies) {
      includePrerequisites(node);
      continue;
    }
    const rune = node.passiveOrRuneRef?.startsWith("rune:")
      ? data.runes.find((entry) => entry.id === node.passiveOrRuneRef!.slice("rune:".length))
      : undefined;
    if (rune && (!rune.targetDiceId && !(rune.targetDiceIds?.length)
      || rune.targetDiceId === diceId
      || rune.targetDiceIds?.includes(diceId))) includePrerequisites(node);
  }
  return relevant;
}

export function intelligenceCandidateNodeIdsV65(data: CanonicalGameData, request: IntelligenceRequestV63) {
  return candidateNodeIds(data, request);
}

export function intelligenceResourceEventsV65(
  data: CanonicalGameData,
  request: IntelligenceRequestV63,
  maxVisitedStates = MAX_VISITED_STATES,
) {
  const relevantIds = candidateNodeIds(data, request);
  const candidates = data.tree.filter((node) => relevantIds.has(node.id));
  const resources = ["gold", "stone", "solarCore"] as const;
  const events = { gold: new Set<number>(), stone: new Set<number>(), solarCore: new Set<number>() };
  const visited = new Set<string>();
  let complete = true;
  const amount = (cost: TreeCost, resource: typeof resources[number]) => cost[resource] ?? 0;
  const walk = (ranks: Record<string, number>, spent: TreeCost, depth: number) => {
    const key = rankKey(ranks);
    if (visited.has(key)) return;
    if (visited.size >= maxVisitedStates) { complete = false; return; }
    visited.add(key);
    if (depth > 0) for (const resource of resources) {
      const otherResourcesFit = resources.every((candidate) => candidate === resource || amount(spent, candidate) <= amount(request.resources, candidate));
      const shortage = amount(spent, resource) - amount(request.resources, resource);
      if (otherResourcesFit && shortage > 0) events[resource].add(shortage);
    }
    if (depth >= request.maxPurchases) return;
    const exceededCurrencies = resources.filter((resource) => amount(spent, resource) > amount(request.resources, resource)).length;
    if (exceededCurrencies > 1) return;
    for (const node of candidates) {
      const rank = ranks[node.id] ?? 0;
      if (rank >= node.maxRank || !prerequisitesMet(node, ranks)) continue;
      const cost = nextRankCost(node, rank);
      if (!cost) continue;
      walk({ ...ranks, [node.id]: rank + 1 }, addTreeCosts(spent, cost), depth + 1);
    }
  };
  walk({ ...request.input.treeRanks }, { ...ZERO_TREE_COST }, 0);
  return {
    events: Object.fromEntries(resources.map((resource) => [resource, [...events[resource]].sort((left, right) => left - right)])) as Record<typeof resources[number], number[]>,
    complete,
    visitedStates: visited.size,
  };
}

function metricsFor(
  request: IntelligenceRequestV63,
  data: CanonicalGameData,
  ranks: Record<string, number>,
  simulate: (input: IntelligenceRequestV63["input"], data: CanonicalGameData) => TreeAwareSimulationResultV3,
): IntelligenceMetricV63[] {
  const before = simulate(request.input, data);
  const after = simulate({ ...request.input, treeRanks: ranks }, data);
  const metrics: IntelligenceMetricV63[] = [];
  const addMetric = (
    id: IntelligenceMetricV63["id"],
    beforeValue: number | null,
    afterValue: number | null,
    confidence: IntelligenceMetricV63["confidence"],
    limitation?: string,
  ) => {
    if (beforeValue === null || afterValue === null) return;
    const absoluteGain = afterValue - beforeValue;
    metrics.push({
      id,
      before: beforeValue,
      after: afterValue,
      absoluteGain,
      percentGain: beforeValue === 0 ? null : (absoluteGain / beforeValue) * 100,
      confidence,
      ...(limitation ? { limitation } : {}),
    });
  };
  addMetric("basic-attack-dps", before.basicAttackDps, after.basicAttackDps, "verified",
    before.practicalDps === null || after.practicalDps === null
      ? "특수 능력을 제외한 기본 공격 DPS만 반영합니다."
      : undefined);
  addMetric("practical-dps", before.practicalDps, after.practicalDps,
    before.confidence === "verified" && after.confidence === "verified" ? "verified" : "partial");
  return metrics;
}

function routeScore(goal: IntelligenceRequestV63["goal"], metrics: IntelligenceMetricV63[], cost: TreeCost, targetDiceSteps: number) {
  if (goal === "target-dice") return targetDiceSteps > 0 ? targetDiceSteps : null;
  if (goal === "pvp" || goal === "coop") return null;
  const practical = metrics.find((metric) => metric.id === "practical-dps" && metric.confidence === "verified");
  const basic = metrics.find((metric) => metric.id === "basic-attack-dps" && metric.confidence === "verified");
  const gain = practical?.percentGain ?? basic?.percentGain;
  if (gain === null || gain === undefined) return null;
  // Cost remains three independent Pareto axes. There is no verified exchange
  // rate that would justify collapsing Gold, Core, and Solar Core into one score.
  void cost;
  return gain;
}

function dominates(left: IntelligenceRouteV63, right: IntelligenceRouteV63) {
  if (left.score === null || right.score === null) return false;
  const noWorse = left.score >= right.score - EPSILON
    && left.cost.gold <= right.cost.gold
    && left.cost.stone <= right.cost.stone
    && (left.cost.solarCore ?? 0) <= (right.cost.solarCore ?? 0);
  const strictlyBetter = left.score > right.score + EPSILON
    || left.cost.gold < right.cost.gold
    || left.cost.stone < right.cost.stone
    || (left.cost.solarCore ?? 0) < (right.cost.solarCore ?? 0);
  return noWorse && strictlyBetter;
}

function routeOrder(left: IntelligenceRouteV63, right: IntelligenceRouteV63) {
  if (left.score !== null && right.score === null) return -1;
  if (left.score === null && right.score !== null) return 1;
  if (left.score !== null && right.score !== null && Math.abs(left.score - right.score) > EPSILON) return right.score - left.score;
  return left.cost.gold - right.cost.gold
    || left.cost.stone - right.cost.stone
    || (left.cost.solarCore ?? 0) - (right.cost.solarCore ?? 0)
    || left.id.localeCompare(right.id);
}

export function optimizeIntelligenceRouteV63(
  data: CanonicalGameData,
  request: IntelligenceRequestV63,
  options: {
    now?: () => number;
    simulate?: (input: IntelligenceRequestV63["input"], data: CanonicalGameData) => TreeAwareSimulationResultV3;
    maxVisitedStates?: number;
  } = {},
): IntelligenceResultV63 {
  if (request.dataVersion !== `${data.manifest.clientVersion}:${data.manifest.sourceSha256.slice(0, 12)}`) {
    throw new Error("Intelligence request dataVersion does not match canonical game data");
  }
  if (!Number.isInteger(request.maxPurchases) || request.maxPurchases < 1 || request.maxPurchases > 8) {
    throw new RangeError("maxPurchases must be an integer from 1 to 8");
  }
  if ([request.resources.gold, request.resources.stone, request.resources.solarCore ?? 0].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("resources must be finite non-negative numbers");
  }

  const now = options.now ?? (() => performance.now());
  const simulate = options.simulate ?? simulateDiceWithTreeV3;
  const maxVisitedStates = options.maxVisitedStates ?? MAX_VISITED_STATES;
  if (!Number.isInteger(maxVisitedStates) || maxVisitedStates < 1) throw new RangeError("maxVisitedStates must be a positive integer");
  const started = now();
  const relevantIds = candidateNodeIds(data, request);
  const candidates = data.tree.filter((node) => relevantIds.has(node.id));
  const visited = new Set<string>();
  const routes: IntelligenceRouteV63[] = [];
  let deduplicatedStates = 0;
  let truncated = false;

  const walk = (
    ranks: Record<string, number>,
    spent: TreeCost,
    steps: IntelligenceRouteStepV63[],
  ) => {
    const key = rankKey(ranks);
    if (visited.has(key)) {
      deduplicatedStates += 1;
      return;
    }
    if (visited.size >= maxVisitedStates) {
      truncated = true;
      return;
    }
    visited.add(key);
    if (steps.length) {
      const metrics = metricsFor(request, data, ranks, simulate);
      const targetDiceSteps = steps.filter((step) => data.tree.find((node) => node.id === step.nodeId)?.targetId === request.input.diceId).length;
      const score = routeScore(request.goal, metrics, spent, targetDiceSteps);
      const unresolved = metrics.some((metric) => metric.limitation);
      const sourceRefs = [...new Set(steps.flatMap((step) => data.tree.find((node) => node.id === step.nodeId)?.sourceRefs ?? []))].sort();
      routes.push({
        id: `route:${key}`,
        rankChanges: Object.fromEntries(Object.entries(ranks).filter(([id, rank]) => rank !== (request.input.treeRanks[id] ?? 0))),
        steps,
        cost: spent,
        remaining: subtractCost(request.resources, spent),
        metrics,
        confidence: score !== null && !unresolved ? "verified" : "partial",
        sourceRefs,
        warnings: unresolved ? ["특수 능력의 전체 전투 기여도는 아직 검증되지 않았습니다."] : [],
        score,
      });
    }
    if (steps.length >= request.maxPurchases) return;

    for (const node of candidates) {
      const rank = ranks[node.id] ?? 0;
      if (rank >= node.maxRank || !prerequisitesMet(node, ranks)) continue;
      const cost = nextRankCost(node, rank);
      if (!cost) continue;
      const nextSpent = addTreeCosts(spent, cost);
      if (!affordable(request.resources, nextSpent)) continue;
      const nextRanks = { ...ranks, [node.id]: rank + 1 };
      walk(nextRanks, nextSpent, [...steps, {
        nodeId: node.id,
        fromRank: rank,
        toRank: rank + 1,
        cost,
        reason: node.targetId === request.input.diceId ? "target-dice" : prerequisitesMet(node, request.input.treeRanks) ? "verified-gain" : "prerequisite",
      }]);
    }
  };

  walk({ ...request.input.treeRanks }, { ...ZERO_TREE_COST }, []);
  const ranked = routes.filter((route) => route.score !== null && route.score > EPSILON).sort(routeOrder);
  const partial = routes.filter((route) => route.score === null).sort(routeOrder);
  const primary = ranked[0] ?? partial[0] ?? null;
  const paretoFront = ranked.filter((candidate) => !ranked.some((other) => other !== candidate && dominates(other, candidate))).sort(routeOrder);
  const prunedDominated = ranked.length - paretoFront.length;
  const alternatives = [...paretoFront.filter((route) => route.id !== primary?.id), ...ranked.filter((route) => route.id !== primary?.id && !paretoFront.includes(route))].slice(0, 3);
  const overlay: IntelligenceResultV63["overlay"] = {};
  for (const [nodeId, rank] of Object.entries(request.input.treeRanks)) if (rank > 0) overlay[nodeId] = "owned";
  primary?.steps.forEach((step, index) => { overlay[step.nodeId] = index === 0 ? "next" : "later"; });
  alternatives.forEach((route) => route.steps.forEach((step) => { if (!overlay[step.nodeId]) overlay[step.nodeId] = "alternative"; }));

  const nextUnaffordable = candidates
    .filter((node) => (request.input.treeRanks[node.id] ?? 0) < node.maxRank && prerequisitesMet(node, request.input.treeRanks))
    .map((node) => ({ node, cost: nextRankCost(node, request.input.treeRanks[node.id] ?? 0)! }))
    .filter((entry) => !affordable(request.resources, entry.cost))
    .sort((left, right) => left.cost.gold - right.cost.gold || left.cost.stone - right.cost.stone || (left.cost.solarCore ?? 0) - (right.cost.solarCore ?? 0));
  for (const entry of nextUnaffordable) if (!overlay[entry.node.id]) overlay[entry.node.id] = "unaffordable";
  const breakpointCost = nextUnaffordable[0]?.cost ?? null;
  const shortage = breakpointCost ? {
    gold: Math.max(0, breakpointCost.gold - request.resources.gold),
    stone: Math.max(0, breakpointCost.stone - request.resources.stone),
    solarCore: Math.max(0, (breakpointCost.solarCore ?? 0) - (request.resources.solarCore ?? 0)),
  } : { ...ZERO_TREE_COST };

  return {
    schemaVersion: 1,
    dataVersion: request.dataVersion,
    calculatedAt: new Date().toISOString(),
    goal: request.goal,
    primary,
    alternatives,
    paretoFront,
    overlay,
    breakpoint: {
      affordableNow: Boolean(primary),
      nextCost: breakpointCost,
      shortage,
      decision: primary?.score !== null && primary?.score !== undefined
        ? "spend"
        : primary
          ? "no-verified-gain"
          : breakpointCost
            ? "save"
            : "no-verified-gain",
    },
    search: {
      algorithm: "exact-dfs-pareto",
      complete: !truncated,
      horizon: request.maxPurchases,
      candidateNodeRanks: candidates.reduce((sum, node) => sum + Math.max(0, node.maxRank - (request.input.treeRanks[node.id] ?? 0)), 0),
      visitedStates: visited.size,
      deduplicatedStates,
      prunedDominated,
      elapsedMs: Math.max(0, now() - started),
      scope: `선택 주사위 ${request.input.diceId}에 적용 가능한 노드와 그 선행 노드, 최대 ${request.maxPurchases}회 랭크 구매`,
    },
    limitations: [
      ...(ranked.length ? [] : ["검증된 성능 증가를 계산할 수 없어 비용 순서만 제시합니다."]),
      ...(request.goal === "resource-efficiency" ? ["골드, 다이스 코어, 태양 코어 사이의 임의 환산율을 만들지 않고 각 비용을 독립적인 Pareto 축으로 비교합니다."] : []),
      ...(request.goal === "pvp" || request.goal === "coop" ? ["현재 데이터에는 이 모드의 검증된 승률이나 전투 기여 공식이 없어 모드 전용 점수를 계산하지 않습니다."] : []),
      ...(truncated ? [`탐색 상태가 ${maxVisitedStates.toLocaleString()}개를 넘어 현재 최선 후보를 반환했습니다. 탐색 범위를 줄이면 최적성을 완전히 증명할 수 있습니다.`] : []),
    ],
  };
}

export function compareIntelligenceRoutesV63(left: IntelligenceRouteV63, right: IntelligenceRouteV63) {
  return {
    scoreDelta: left.score === null || right.score === null ? null : left.score - right.score,
    goldDelta: left.cost.gold - right.cost.gold,
    stoneDelta: left.cost.stone - right.cost.stone,
    solarCoreDelta: (left.cost.solarCore ?? 0) - (right.cost.solarCore ?? 0),
    leftDominates: dominates(left, right),
    rightDominates: dominates(right, left),
  };
}

export const __optimizerInternalsV63 = { affordable, candidateNodeIds, dominates, rankKey, subtractCost, costKey };
