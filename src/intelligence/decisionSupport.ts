import type { CanonicalGameData, DiceTreeNodeV3, TreeCost } from "../game-data/types";
import { addTreeCosts, nextRankCost, ZERO_TREE_COST } from "../planner-v3/costs";
import { simulateDiceWithTreeV3 } from "../simulation/engine/simulateTreeAware";
import type { TreeAwareSimulationResultV3 } from "../simulation/engine/simulateTreeAware";
import { analysisRevisionIdV65 } from "./analysisState";
import { compareIntelligenceRoutesV63, intelligenceCandidateNodeIdsV65, intelligenceResourceEventsV65, optimizeIntelligenceRouteV63 } from "./optimizer";
import type { IntelligenceRequestV63, IntelligenceResultV63, IntelligenceRouteV63, IntelligenceResourceKindV64, MetaEvidenceV63 } from "./types";

const RESOURCE_KINDS: IntelligenceResourceKindV64[] = ["gold", "stone", "solarCore"];
const MAX_EVENTS_PER_RESOURCE = 32;

export interface RecommendationBreakpointV65 {
  resource: IntelligenceResourceKindV64;
  amount: number;
  routeId: string | null;
  routeNodeIds: string[];
  triggerNodeId: string;
  routeCost: TreeCost | null;
  routeRemaining: TreeCost | null;
  routeScore: number | null;
}

export interface RouteContributionV65 {
  nodeId: string;
  fromRank: number;
  toRank: number;
  role: "direct" | "bridge";
  value: number | null;
  metric: "target-step" | "practical-dps" | "basic-attack-dps" | "unverified";
  affectedDeckDiceIds: string[];
}

export interface DecisionSupportV65 {
  revisionId: string;
  breakpoints: RecommendationBreakpointV65[];
  eventSearch: { tested: number; complete: boolean };
  stability: {
    level: "high" | "medium" | "low";
    scoreGap: number | null;
    nearEquivalentAlternatives: number;
    upwardChange: RecommendationBreakpointV65 | null;
    downwardChange: Partial<TreeCost>;
    reasons: string[];
  };
  evidenceConfidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
    metaUsedInScore: false;
    metaSnapshot: string | null;
  };
  bottlenecks: Array<{ resource: IntelligenceResourceKindV64; amount: number; basis: "route-change" | "next-purchase" }>;
  saveVsSpend: {
    verdict: "spend" | "save" | "tradeoff" | "unverified";
    reason: string;
  };
  contributions: RouteContributionV65[];
}

export interface IntelligenceAnalysisPacketV65 {
  result: IntelligenceResultV63;
  support: DecisionSupportV65;
}

export interface CounterfactualV65 {
  scoreDelta: number | null;
  costDelta: TreeCost;
  remainingDelta: TreeCost;
  verdict: "recommended-dominates" | "alternative-tradeoff" | "unverified";
  reason: "lower-effect" | "higher-cost" | "currency-tradeoff" | "insufficient-evidence";
}

function costValue(cost: TreeCost, kind: IntelligenceResourceKindV64) {
  return cost[kind] ?? 0;
}

function routeId(result: IntelligenceResultV63) {
  return result.primary?.id ?? null;
}

function routeMetric(route: IntelligenceRouteV63 | null) {
  return route?.metrics.find((entry) => entry.id === "practical-dps" && entry.confidence === "verified")
    ?? route?.metrics.find((entry) => entry.id === "basic-attack-dps" && entry.confidence === "verified")
    ?? null;
}

function minimumPlanToNextRank(data: CanonicalGameData, request: IntelligenceRequestV63, targetNodeId: string) {
  const byId = new Map(data.tree.map((node) => [node.id, node]));
  const ranks = { ...request.input.treeRanks };
  const visiting = new Set<string>();
  const steps: Array<{ nodeId: string; toRank: number; cost: TreeCost }> = [];
  let cost = { ...ZERO_TREE_COST };
  const ensureRank = (nodeId: string, targetRank: number): boolean => {
    if ((ranks[nodeId] ?? 0) >= targetRank) return true;
    const node = byId.get(nodeId);
    if (!node || targetRank > node.maxRank || visiting.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const prerequisite of node.prerequisites) {
      if (!ensureRank(prerequisite.nodeId, prerequisite.minRank)) return false;
    }
    while ((ranks[nodeId] ?? 0) < targetRank) {
      const next = nextRankCost(node, ranks[nodeId] ?? 0);
      if (!next) return false;
      ranks[nodeId] = (ranks[nodeId] ?? 0) + 1;
      cost = addTreeCosts(cost, next);
      steps.push({ nodeId, toRank: ranks[nodeId], cost: next });
    }
    visiting.delete(nodeId);
    return true;
  };
  const currentRank = ranks[targetNodeId] ?? 0;
  if (!ensureRank(targetNodeId, currentRank + 1)) return null;
  return { targetNodeId, cost, steps };
}

function resourceShortage(cost: TreeCost, resources: TreeCost): TreeCost {
  return {
    gold: Math.max(0, cost.gold - resources.gold),
    stone: Math.max(0, cost.stone - resources.stone),
    solarCore: Math.max(0, (cost.solarCore ?? 0) - (resources.solarCore ?? 0)),
  };
}

function changedByOnly(shortage: TreeCost, kind: IntelligenceResourceKindV64) {
  return RESOURCE_KINDS.every((candidate) => candidate === kind || costValue(shortage, candidate) === 0);
}

function affectedDeckDiceIds(data: CanonicalGameData, node: DiceTreeNodeV3, deckIds: string[]) {
  const validDeck = deckIds.filter((id) => data.dice.some((dice) => dice.id === id));
  if (node.targetId) return validDeck.filter((id) => id === node.targetId);
  const passive = node.passiveOrRuneRef ? data.passives.find((entry) => entry.id === node.passiveOrRuneRef) : undefined;
  if (passive?.scope === "global") return validDeck;
  if (passive?.scope === "dice") return validDeck.filter((id) => passive.targetDiceIds?.includes(id));
  if (passive) return validDeck.filter((id) => data.dice.find((dice) => dice.id === id)?.family === passive.scope);
  const runeId = node.passiveOrRuneRef?.startsWith("rune:") ? node.passiveOrRuneRef.slice(5) : undefined;
  const rune = runeId ? data.runes.find((entry) => entry.id === runeId) : undefined;
  const targets = rune ? [rune.targetDiceId, ...(rune.targetDiceIds ?? [])].filter((id): id is string => Boolean(id)) : [];
  return targets.length ? validDeck.filter((id) => targets.includes(id)) : [];
}

function routeContributions(
  data: CanonicalGameData,
  request: IntelligenceRequestV63,
  route: IntelligenceRouteV63 | null,
  simulate: (input: IntelligenceRequestV63["input"], data: CanonicalGameData) => TreeAwareSimulationResultV3,
): RouteContributionV65[] {
  if (!route) return [];
  const ranks = { ...request.input.treeRanks };
  let previous = simulate(request.input, data);
  return route.steps.map((step) => {
    ranks[step.nodeId] = step.toRank;
    const next = simulate({ ...request.input, treeRanks: { ...ranks } }, data);
    const node = data.tree.find((entry) => entry.id === step.nodeId)!;
    let value: number | null = null;
    let metric: RouteContributionV65["metric"] = "unverified";
    if (request.goal === "target-dice") {
      value = node.targetId === request.input.diceId ? 1 : 0;
      metric = "target-step";
    } else if (previous.practicalDps !== null && next.practicalDps !== null && previous.confidence === "verified" && next.confidence === "verified") {
      value = next.practicalDps - previous.practicalDps;
      metric = "practical-dps";
    } else if (previous.basicAttackDps !== null && next.basicAttackDps !== null) {
      value = next.basicAttackDps - previous.basicAttackDps;
      metric = "basic-attack-dps";
    }
    previous = next;
    return {
      nodeId: step.nodeId,
      fromRank: step.fromRank,
      toRank: step.toRank,
      role: step.reason === "prerequisite" ? "bridge" : "direct",
      value,
      metric,
      affectedDeckDiceIds: affectedDeckDiceIds(data, node, request.activeDeckIds),
    };
  });
}

export function analyzeDecisionSupportV65(
  data: CanonicalGameData,
  request: IntelligenceRequestV63,
  result: IntelligenceResultV63,
  meta: MetaEvidenceV63 | null = null,
  options: {
    optimize?: typeof optimizeIntelligenceRouteV63;
    simulate?: (input: IntelligenceRequestV63["input"], data: CanonicalGameData) => TreeAwareSimulationResultV3;
  } = {},
): DecisionSupportV65 {
  const optimize = options.optimize ?? optimizeIntelligenceRouteV63;
  const simulate = options.simulate ?? simulateDiceWithTreeV3;
  const relevantIds = intelligenceCandidateNodeIdsV65(data, request);
  const plans = [...relevantIds]
    .map((nodeId) => minimumPlanToNextRank(data, request, nodeId))
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan))
    .map((plan) => ({ ...plan, shortage: resourceShortage(plan.cost, request.resources) }));
  const breakpoints: RecommendationBreakpointV65[] = [];
  let tested = 0;
  const resourceEvents = intelligenceResourceEventsV65(data, request);
  let eventSearchComplete = resourceEvents.complete;
  for (const resource of RESOURCE_KINDS) {
    const candidates = resourceEvents.events[resource];
    if (candidates.length > MAX_EVENTS_PER_RESOURCE) eventSearchComplete = false;
    for (const amount of candidates.slice(0, MAX_EVENTS_PER_RESOURCE)) {
      tested += 1;
      const nextRequest = {
        ...request,
        resources: { ...request.resources, [resource]: costValue(request.resources, resource) + amount },
      };
      const next = optimize(data, nextRequest);
      if (routeId(next) === routeId(result)) continue;
      const trigger = plans.find((plan) => costValue(plan.shortage, resource) === amount && changedByOnly(plan.shortage, resource));
      breakpoints.push({
        resource,
        amount,
        routeId: routeId(next),
        routeNodeIds: next.primary?.steps.map((step) => step.nodeId) ?? [],
        triggerNodeId: trigger?.targetNodeId ?? next.primary?.steps.at(-1)?.nodeId ?? "",
        routeCost: next.primary?.cost ?? null,
        routeRemaining: next.primary?.remaining ?? null,
        routeScore: next.primary?.score ?? null,
      });
      break;
    }
  }

  const primary = result.primary;
  const scoredAlternative = result.alternatives.find((route) => route.score !== null);
  const scoreGap = primary?.score !== null && primary?.score !== undefined && scoredAlternative?.score !== null && scoredAlternative?.score !== undefined
    ? primary.score - scoredAlternative.score : null;
  const nearEquivalentAlternatives = primary?.score === null || primary?.score === undefined
    ? result.alternatives.length
    : result.alternatives.filter((route) => route.score !== null && Math.abs(route.score - primary.score!) <= Math.max(0.01, Math.abs(primary.score!) * 0.02)).length;
  const downwardChange: Partial<TreeCost> = {};
  if (primary) for (const resource of RESOURCE_KINDS) {
    if (costValue(primary.cost, resource) > 0) downwardChange[resource] = costValue(primary.remaining, resource) + 1;
  }
  const nearThreshold = breakpoints.some((entry) => entry.amount <= Math.max(1, Math.floor(costValue(request.resources, entry.resource) * 0.1)));
  const narrowBudget = RESOURCE_KINDS.some((resource) => {
    const amount = downwardChange[resource];
    return amount !== undefined && amount <= Math.max(1, Math.floor(costValue(request.resources, resource) * 0.05));
  });
  const stabilityLevel: DecisionSupportV65["stability"]["level"] = nearThreshold || narrowBudget || nearEquivalentAlternatives > 1
    ? "low" : breakpoints.length || nearEquivalentAlternatives ? "medium" : result.search.complete && eventSearchComplete ? "high" : "medium";
  const stabilityReasons = [
    ...(breakpoints[0] ? [`${breakpoints[0].resource}+${breakpoints[0].amount}에서 추천 경로가 바뀝니다.`] : ["검사한 단일 재화 임계점에서는 추천 경로가 유지됩니다."]),
    ...RESOURCE_KINDS.flatMap((resource) => downwardChange[resource] === undefined ? [] : [`${resource}-${downwardChange[resource]}이면 현재 추천 경로를 더 이상 구매할 수 없습니다.`]),
    ...(scoreGap === null ? [] : [`가장 가까운 대안과의 점수 차이는 ${scoreGap.toFixed(4)}입니다.`]),
    ...(nearEquivalentAlternatives ? [`점수가 근접한 대안이 ${nearEquivalentAlternatives}개 있습니다.`] : []),
    ...(!eventSearchComplete ? ["일부 먼 임계점은 성능 한도 밖이라 안정성 판정에서 제외했습니다."] : []),
  ];

  const confidenceLevel: DecisionSupportV65["evidenceConfidence"]["level"] = !primary || !result.search.complete
    ? "low" : primary.confidence === "verified" && !result.limitations.length ? "high" : "medium";
  const confidenceReasons = [
    result.search.complete ? "현재 구매 범위의 탐색을 완료했습니다." : "상태 한도로 탐색이 조기 종료됐습니다.",
    primary?.confidence === "verified" ? "추천 수치가 검증된 계산식에 연결됩니다." : "일부 효과는 비용과 선행 조건만 검증됐습니다.",
    "메타 표본은 추천 점수에 합산하지 않았습니다.",
  ];
  const bottlenecks: DecisionSupportV65["bottlenecks"] = breakpoints.map((entry) => ({ resource: entry.resource, amount: entry.amount, basis: "route-change" }));
  if (!bottlenecks.length && result.breakpoint.nextCost) {
    for (const resource of RESOURCE_KINDS) {
      const amount = costValue(result.breakpoint.shortage, resource);
      if (amount > 0) bottlenecks.push({ resource, amount, basis: "next-purchase" });
    }
  }
  const verifiedUpgradeBreakpoint = primary?.score !== null && primary?.score !== undefined
    ? breakpoints.find((entry) => entry.routeScore !== null && entry.routeScore > primary.score!)
    : undefined;
  const saveVsSpend: DecisionSupportV65["saveVsSpend"] = primary && verifiedUpgradeBreakpoint
    ? { verdict: "tradeoff", reason: "현재 경로는 실행 가능하지만, 재화별 변경점 이후 더 높은 점수의 경로가 열립니다. 재화 획득 시간의 검증값이 없어 둘 중 하나를 단정하지 않습니다." }
    : primary && breakpoints.length
      ? { verdict: "unverified", reason: "재화 변경점에서 경로는 달라지지만 검증된 점수 이득이 없어 저장과 투자의 우열을 단정하지 않습니다." }
    : primary
      ? { verdict: "spend", reason: "현재 경로는 실행 가능하며 검사한 재화 이벤트에서는 다른 최적 경로가 열리지 않았습니다." }
      : breakpoints.length || result.breakpoint.nextCost
        ? { verdict: "save", reason: "현재 실행 경로가 없고 추가 재화에서 구매 또는 추천 경로가 열립니다." }
        : { verdict: "unverified", reason: "현재 범위에는 실행 경로나 검증된 재화 변경점이 없습니다." };
  return {
    revisionId: analysisRevisionIdV65(request),
    breakpoints,
    eventSearch: { tested, complete: eventSearchComplete },
    stability: {
      level: stabilityLevel,
      scoreGap,
      nearEquivalentAlternatives,
      upwardChange: breakpoints[0] ?? null,
      downwardChange,
      reasons: stabilityReasons,
    },
    evidenceConfidence: {
      level: confidenceLevel,
      reasons: confidenceReasons,
      metaUsedInScore: false,
      metaSnapshot: meta?.snapshotDate ?? null,
    },
    bottlenecks,
    saveVsSpend,
    contributions: routeContributions(data, request, primary, simulate),
  };
}

export function compareCounterfactualV65(recommended: IntelligenceRouteV63, alternative: IntelligenceRouteV63): CounterfactualV65 {
  const comparison = compareIntelligenceRoutesV63(recommended, alternative);
  const costDelta = {
    gold: alternative.cost.gold - recommended.cost.gold,
    stone: alternative.cost.stone - recommended.cost.stone,
    solarCore: (alternative.cost.solarCore ?? 0) - (recommended.cost.solarCore ?? 0),
  };
  const remainingDelta = {
    gold: alternative.remaining.gold - recommended.remaining.gold,
    stone: alternative.remaining.stone - recommended.remaining.stone,
    solarCore: (alternative.remaining.solarCore ?? 0) - (recommended.remaining.solarCore ?? 0),
  };
  if (comparison.leftDominates) return { scoreDelta: comparison.scoreDelta, costDelta, remainingDelta, verdict: "recommended-dominates", reason: comparison.scoreDelta && comparison.scoreDelta > 0 ? "lower-effect" : "higher-cost" };
  if (comparison.scoreDelta === null) return { scoreDelta: null, costDelta, remainingDelta, verdict: "unverified", reason: "insufficient-evidence" };
  return { scoreDelta: comparison.scoreDelta, costDelta, remainingDelta, verdict: "alternative-tradeoff", reason: "currency-tradeoff" };
}

export function recommendationSummaryV65(result: IntelligenceResultV63, nodeLabel: (nodeId: string) => string, locale: "ko" | "en") {
  if (!result.primary) return locale === "ko"
    ? "현재 재화에서는 실행 가능한 추천 경로가 없습니다."
    : "No recommended route is currently affordable.";
  const route = result.primary.steps.map((step) => nodeLabel(step.nodeId)).join(" → ");
  const metric = routeMetric(result.primary);
  if (metric?.percentGain !== null && metric?.percentGain !== undefined) return locale === "ko"
    ? `현재 재화에서는 ${route} 경로가 검증된 성능 증가가 가장 큽니다.`
    : `${route} provides the largest verified improvement for the current resources.`;
  return locale === "ko"
    ? `현재 재화에서는 ${route} 경로가 목표와 선행 조건에 가장 잘 맞습니다.`
    : `${route} best matches the current goal and prerequisites.`;
}
