import type { CanonicalGameData, RuneDefinitionV3, TreeCost } from "../game-data/types";
import { versusWavesV3 } from "../game-data/load";
import { addTreeCosts, ZERO_TREE_COST } from "../planner-v3/costs";
import { planNextRankRouteV3 } from "../planner-v3/routes";
import { simulateDiceWithTreeV3 } from "../simulation/engine/simulateTreeAware";
import type { SimulationInputV3 } from "../simulation/engine/types";
import { recommendTreeInvestmentsV3 } from "./recommendV3";

export type OptimizerConfidenceV52 = "verified" | "partial" | "unavailable";

export interface MultiStepBuildStepV52 {
  order: number;
  nodeId: string;
  fromRank: number;
  toRank: number;
  cost: TreeCost;
  cumulativeCost: TreeCost;
  dpsBefore: number;
  dpsAfter: number;
  gainPercent: number;
  cumulativeGainPercent: number;
  targetRanks: Record<string, number>;
  routeSteps: Array<{ nodeId: string; fromRank: number; toRank: number; target: boolean }>;
  reason: { ko: string; en: string };
}

export interface MultiStepBuildPlanV52 {
  baselineDps: number | null;
  targetDps: number;
  achievedDps: number | null;
  reached: boolean;
  confidence: OptimizerConfidenceV52;
  steps: MultiStepBuildStepV52[];
  totalCost: TreeCost;
  evaluatedStates: number;
  stopReason: "target" | "budget" | "depth" | "unavailable";
  checkpoints: Array<{ step: number; dps: number; gainPercent: number; cost: TreeCost }>;
}

interface BeamStateV52 {
  ranks: Record<string, number>;
  dps: number;
  confidence: "verified" | "partial";
  cost: TreeCost;
  steps: MultiStepBuildStepV52[];
}

function performance(input: SimulationInputV3, data: CanonicalGameData) {
  const result = simulateDiceWithTreeV3(input, data);
  if (result.practicalDps !== null) return { dps: result.practicalDps, confidence: "verified" as const };
  const projected = result.projectedBasicAttackDps ?? result.basicAttackDps;
  if (projected !== null && projected !== undefined) return { dps: projected, confidence: "partial" as const };
  const stats = result.stats as Record<string, number | undefined>;
  const hasSupportedRawEffect = result.trace.some((step) => step.applied && step.confidence === "verified" && ["flatBulletDamage", "bulletDamagePercent", "attackSpeedPercent"].includes(step.stat));
  const attack = (stats.attack ?? 0) + (stats.flatBulletDamage ?? 0);
  const interval = stats.attackInterval ?? 0;
  if (hasSupportedRawEffect && attack > 0 && interval > 0) {
    const damageFactor = Math.max(0, 1 + (stats.bulletDamagePercent ?? 0) / 100);
    const speedFactor = Math.max(0.01, 1 + (stats.attackSpeedPercent ?? 0) / 100);
    return { dps: (attack / interval) * damageFactor * speedFactor, confidence: "partial" as const };
  }
  return { dps: null, confidence: "unavailable" as const };
}

function withinBudget(cost: TreeCost, budget: TreeCost) {
  return cost.gold <= budget.gold && cost.stone <= budget.stone && (cost.solarCore ?? 0) <= (budget.solarCore ?? 0);
}

function rankKey(ranks: Record<string, number>) {
  return Object.entries(ranks).filter(([, rank]) => rank > 0).sort(([a], [b]) => a.localeCompare(b)).map(([id, rank]) => `${id}:${rank}`).join("|");
}

function stateScore(state: BeamStateV52, targetDps: number) {
  const progress = Math.min(1, state.dps / Math.max(1, targetDps));
  const resourceUnits = state.cost.gold / 10_000 + state.cost.stone * 12 + (state.cost.solarCore ?? 0) * 12;
  return progress * 1_000_000 + state.dps / Math.max(1, 1 + resourceUnits);
}

function relevantNodeIdsV52(data: CanonicalGameData, diceId: string) {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return data.tree.filter((node) => {
    if (node.kind === "connector") return false;
    if (node.targetId === diceId) return true;
    if (dice?.family && node.family === dice.family) return true;
    const linked = node.passiveOrRuneRef;
    if (linked?.startsWith("passive:")) {
      const passive = data.passives.find((entry) => entry.id === linked.slice(8));
      if (!passive) return false;
      return passive.scope === "global"
        || passive.scope === dice?.family
        || (passive.scope === "dice" && (passive.targetDiceIds ?? []).includes(diceId));
    }
    if (linked?.startsWith("rune:")) {
      const rune = data.runes.find((entry) => entry.id === linked.slice(5));
      const targets = rune ? runeTargets(rune) : [];
      return targets.length === 0 || targets.includes(diceId);
    }
    return false;
  }).map((node) => node.id);
}

export function solveMultiStepBuildV52(baseInput: SimulationInputV3, data: CanonicalGameData, options: {
  targetDps: number;
  budget: TreeCost;
  maxSteps: 1 | 5 | 10 | 20;
  beamWidth?: number;
  candidateWidth?: number;
  bannedNodeIds?: readonly string[];
}): MultiStepBuildPlanV52 {
  const measured = performance(baseInput, data);
  if (measured.dps === null) return {
    baselineDps: null, targetDps: options.targetDps, achievedDps: null, reached: false,
    confidence: "unavailable", steps: [], totalCost: { ...ZERO_TREE_COST }, evaluatedStates: 0,
    stopReason: "unavailable", checkpoints: [],
  };
  const baselineDps = measured.dps;
  const targetDps = Math.max(baselineDps, options.targetDps);
  const banned = new Set(options.bannedNodeIds ?? []);
  const beamWidth = Math.max(2, Math.min(24, options.beamWidth ?? 8));
  const candidateWidth = Math.max(2, Math.min(16, options.candidateWidth ?? 7));
  let frontier: BeamStateV52[] = [{ ranks: { ...baseInput.treeRanks }, dps: baselineDps, confidence: measured.confidence === "partial" ? "partial" : "verified", cost: { ...ZERO_TREE_COST }, steps: [] }];
  let best = frontier[0];
  let evaluatedStates = 0;
  let exhaustedByBudget = false;
  const relevantIds = relevantNodeIdsV52(data, baseInput.diceId);

  for (let depth = 0; depth < options.maxSteps; depth += 1) {
    const expanded: BeamStateV52[] = [];
    for (const state of frontier) {
      const recommendations = recommendTreeInvestmentsV3({ ...baseInput, treeRanks: state.ranks }, data, { limit: candidateWidth }).verified
        .filter((entry) => !banned.has(entry.nodeId) && (entry.percentGain ?? 0) > 0)
        .map((entry) => entry.nodeId);
      const candidateIds = [...new Set([...recommendations, ...relevantIds])].filter((nodeId) => !banned.has(nodeId));
      const stateExpansions: BeamStateV52[] = [];
      for (const nodeId of candidateIds) {
        const route = planNextRankRouteV3(data.tree, state.ranks, nodeId);
        if (!route?.steps.length) continue;
        const cumulativeCost = addTreeCosts(state.cost, route.totalCost);
        if (!withinBudget(cumulativeCost, options.budget)) { exhaustedByBudget = true; continue; }
        const ranks = { ...state.ranks, ...route.targetRanks };
        const measuredAfter = performance({ ...baseInput, treeRanks: ranks }, data);
        evaluatedStates += 1;
        if (measuredAfter.dps === null || measuredAfter.dps <= state.dps) continue;
        const dpsAfter = measuredAfter.dps;
        const gainPercent = ((dpsAfter - state.dps) / Math.max(Number.EPSILON, state.dps)) * 100;
        const step: MultiStepBuildStepV52 = {
          order: state.steps.length + 1,
          nodeId,
          fromRank: state.ranks[nodeId] ?? 0,
          toRank: ranks[nodeId] ?? 0,
          cost: route.totalCost,
          cumulativeCost: { ...cumulativeCost },
          dpsBefore: state.dps,
          dpsAfter,
          gainPercent,
          cumulativeGainPercent: ((dpsAfter - baselineDps) / Math.max(Number.EPSILON, baselineDps)) * 100,
          targetRanks: { ...ranks },
          routeSteps: route.steps.map(({ nodeId, fromRank, toRank, target }) => ({ nodeId, fromRank, toRank, target })),
          reason: {
            ko: `선행 노드 ${Math.max(0, route.steps.length - 1)}개 비용까지 포함한 후보 중 목표 DPS 도달 기여도가 높습니다.`,
            en: `High target-DPS contribution after including ${Math.max(0, route.steps.length - 1)} prerequisite steps.`,
          },
        };
        stateExpansions.push({ ranks, dps: dpsAfter, confidence: state.confidence === "partial" || measuredAfter.confidence === "partial" ? "partial" : "verified", cost: cumulativeCost, steps: [...state.steps, step] });
      }
      expanded.push(...stateExpansions.sort((a, b) => stateScore(b, targetDps) - stateScore(a, targetDps)).slice(0, candidateWidth));
    }
    if (!expanded.length) break;
    const deduplicated = new Map<string, BeamStateV52>();
    for (const state of expanded) {
      const key = rankKey(state.ranks);
      const prior = deduplicated.get(key);
      if (!prior || state.dps > prior.dps || (state.dps === prior.dps && state.cost.gold < prior.cost.gold)) deduplicated.set(key, state);
    }
    frontier = [...deduplicated.values()].sort((a, b) => stateScore(b, targetDps) - stateScore(a, targetDps)).slice(0, beamWidth);
    const roundBest = [...frontier].sort((a, b) => b.dps - a.dps || a.cost.gold - b.cost.gold || a.cost.stone - b.cost.stone)[0];
    if (roundBest.dps > best.dps) best = roundBest;
    const reached = frontier.filter((state) => state.dps >= targetDps).sort((a, b) => a.cost.gold - b.cost.gold || a.cost.stone - b.cost.stone)[0];
    if (reached) { best = reached; break; }
  }

  const checkpoints = best.steps
    .filter((step) => [1, 5, 10, 20].includes(step.order) || step.order === best.steps.length)
    .map((step) => ({ step: step.order, dps: step.dpsAfter, gainPercent: step.cumulativeGainPercent, cost: { ...step.cumulativeCost } }));
  const reached = best.dps >= targetDps;
  return {
    baselineDps, targetDps, achievedDps: best.dps, reached, confidence: best.confidence,
    steps: best.steps, totalCost: best.cost, evaluatedStates,
    stopReason: reached ? "target" : exhaustedByBudget ? "budget" : "depth",
    checkpoints,
  };
}

export interface RuneCandidateV52 {
  runeId: string;
  kind: string;
  rank: number;
  score: number;
  primaryValue?: number;
  confidence: "partial";
  reason: { ko: string; en: string };
}

function runeTargets(rune: RuneDefinitionV3) {
  return rune.targetDiceIds?.length ? rune.targetDiceIds : rune.targetDiceId ? [rune.targetDiceId] : [];
}

export function rankRunesForDiceV52(data: CanonicalGameData, diceId: string, ownedRuneIds?: ReadonlySet<string>): RuneCandidateV52[] {
  return data.runes
    .filter((rune) => (!ownedRuneIds || ownedRuneIds.has(rune.id)) && (runeTargets(rune).includes(diceId) || runeTargets(rune).length === 0))
    .map((rune) => {
      const rank = Math.max(1, rune.maxRank ?? 1);
      const values = Object.entries(rune.values).filter(([, value]) => typeof value === "number") as Array<[string, number]>;
      const primary = values.find(([key]) => /^Value1?$/.test(key))?.[1] ?? values[0]?.[1];
      const directAttack = /BulletAtkPercentUp/i.test(rune.kind ?? "");
      const directSpeed = /AtkSpeedPercentUp/i.test(rune.kind ?? "");
      const targetMatch = runeTargets(rune).includes(diceId);
      const score = (targetMatch ? 35 : 8) + (directAttack || directSpeed ? 35 : 10) + Math.min(30, Math.abs(primary ?? 0));
      return {
        runeId: rune.id, kind: rune.kind ?? rune.id, rank, score, ...(primary === undefined ? {} : { primaryValue: primary }),
        confidence: "partial" as const,
        reason: directAttack || directSpeed
          ? { ko: "공격력 또는 공격속도에 직접 연결되는 룬이지만 런타임 적용 순서는 부분 검증입니다.", en: "Directly affects attack or speed, but runtime ordering remains partially verified." }
          : { ko: "대상 주사위와 효과 값의 관련성으로 정렬했으며 특수 기믹 DPS는 추정하지 않습니다.", en: "Ranked by target relevance and effect values without inventing special-mechanic DPS." },
      };
    })
    .sort((a, b) => b.score - a.score || a.runeId.localeCompare(b.runeId));
}

export interface WaveGoalResultV52 {
  currentDps: number | null;
  targetWave: number;
  estimatedCurrentWave: number | null;
  requiredDps: number;
  requiredGainPercent: number | null;
  projectedTargetHp: number;
  confidence: "partial" | "unavailable";
  basis: { hpIncreasePercent: number; interval: number; durationSeconds: number };
}

export function solveWaveGoalV52(input: SimulationInputV3, data: CanonicalGameData, targetWave: number, baseWaveHp: number): WaveGoalResultV52 {
  const row = versusWavesV3[0] ?? {};
  const hpIncreasePercent = Number(row.HPIncrease) || 15;
  const interval = Math.max(1, Number(row.HPIncreaseInterval) || 10);
  const durationSeconds = Math.max(1, Number(row.Duration) || input.durationSeconds);
  const hpAt = (wave: number) => baseWaveHp * Math.pow(1 + hpIncreasePercent / 100, Math.floor(Math.max(0, wave - 1) / interval));
  const target = Math.max(1, Math.floor(targetWave));
  const projectedTargetHp = hpAt(target);
  const requiredDps = projectedTargetHp / durationSeconds;
  const measured = performance(input, data);
  let estimatedCurrentWave: number | null = null;
  if (measured.dps !== null) {
    for (let wave = 1; wave <= 999; wave += 1) {
      if (hpAt(wave) / durationSeconds > measured.dps) break;
      estimatedCurrentWave = wave;
    }
  }
  return {
    currentDps: measured.dps, targetWave: target, estimatedCurrentWave, requiredDps,
    requiredGainPercent: measured.dps === null ? null : ((requiredDps - measured.dps) / Math.max(Number.EPSILON, measured.dps)) * 100,
    projectedTargetHp, confidence: measured.dps === null ? "unavailable" : "partial",
    basis: { hpIncreasePercent, interval, durationSeconds },
  };
}
