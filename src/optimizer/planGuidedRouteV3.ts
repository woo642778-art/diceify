import type { CanonicalGameData, DiceFamilyV3, DiceTreeNodeV3, TreeCost } from "../game-data/types";
import { addTreeCosts, treeCostForRange, ZERO_TREE_COST } from "../planner-v3/costs";
import { planNextRankRouteV3 } from "../planner-v3/routes";

export type GuidedRouteRoleV3 = "dealer" | "support" | "balanced";
export type GuidedRouteFocusV3 = "selected-dice" | "damage" | "attack-speed" | "critical" | "economy" | "survival" | "special";
export type GuidedRouteStyleV3 = "efficient" | "power" | "specialized";
export type GuidedRouteLengthV3 = "short" | "standard" | "long";

export interface GuidedRouteSettingsV3 {
  diceId: string;
  role: GuidedRouteRoleV3;
  focus: GuidedRouteFocusV3;
  style: GuidedRouteStyleV3;
  length: GuidedRouteLengthV3;
  budget: TreeCost;
  currentRanks: Record<string, number>;
  variant?: number;
  budgetMode?: "strict" | "virtual";
}

export interface GuidedRouteStepV3 {
  order: number;
  nodeId: string;
  fromRank: number;
  toRank: number;
  cost: TreeCost;
  prerequisite: boolean;
  reasons: string[];
}

export interface GuidedRoutePlanV3 {
  settings: GuidedRouteSettingsV3;
  steps: GuidedRouteStepV3[];
  targetRanks: Record<string, number>;
  totalCost: TreeCost;
  remaining: TreeCost;
  summaryReasons: string[];
  tradeoffs: string[];
  validity: {
    prerequisitesSatisfied: boolean;
    exactCosts: boolean;
    withinBudget: boolean;
  };
  confidence: "structural" | "verified-effects";
  goal: {
    reached: boolean;
    targetNodeId?: string;
    progressSteps: number;
    stopReason?: "budget" | "length" | "no-target-node";
  };
}

const LENGTH_LIMITS: Record<GuidedRouteLengthV3, number> = { short: 8, standard: 16, long: 30 };

function contains(value: string, tokens: readonly string[]) {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token.toLowerCase()));
}

function nodeSemantics(node: DiceTreeNodeV3) {
  return [node.id, node.targetId, node.passiveOrRuneRef, node.nameKey, node.descriptionKey].filter(Boolean).join(" ");
}

function focusScore(text: string, focus: GuidedRouteFocusV3) {
  const damage = contains(text, ["attackup", "damage", "dmg", "bulletatk", "attack_up"]);
  const speed = contains(text, ["atkspeed", "attackspeed", "interval", "speedup"]);
  const critical = contains(text, ["crit", "critical"]);
  const economy = contains(text, ["startsp", "spdiscount", "spawnsp", "summon", "mergegain", "discount"]);
  const survival = contains(text, ["starthp", "slow", "lock", "delay", "freeze", "heal", "shield"]);
  const special = contains(text, ["rune:", "defender", "skill", "special", "perk"]);
  const scores: Record<GuidedRouteFocusV3, number> = {
    "selected-dice": special ? 4 : damage || speed || critical ? 3 : 1,
    damage: damage ? 7 : speed || critical ? 2 : 0.5,
    "attack-speed": speed ? 8 : damage ? 1.5 : 0.5,
    critical: critical ? 8 : damage ? 1.5 : 0.5,
    economy: economy ? 8 : survival ? 1 : 0.3,
    survival: survival ? 8 : economy ? 1 : 0.3,
    special: special ? 8 : damage || speed || critical ? 1.5 : 0.5,
  };
  return { score: scores[focus], damage, speed, critical, economy, survival, special };
}

function scopeScore(node: DiceTreeNodeV3, data: CanonicalGameData, diceId: string, family?: DiceFamilyV3) {
  if (node.targetId === diceId) return { score: 8, reason: "selected-dice" };
  if (node.targetId && node.targetId !== diceId) return { score: 0.05, reason: "other-dice" };
  const linked = node.passiveOrRuneRef;
  if (linked?.startsWith("passive:")) {
    const passive = data.passives.find((candidate) => candidate.id === linked.slice("passive:".length));
    if (passive?.scope === "global") return { score: 4, reason: "global-effect" };
    if (passive?.scope === family) return { score: 6, reason: "matching-family" };
    if (passive?.scope === "dice" && passive.targetDiceIds?.includes(diceId)) return { score: 8, reason: "selected-dice" };
    if (passive) return { score: 0.1, reason: "other-family" };
  }
  if (node.family === "core") return { score: 2.5, reason: "core-path" };
  if (node.family === family) return { score: 3.5, reason: "matching-family" };
  return { score: 0.35, reason: "cross-family" };
}

function roleScore(text: string, role: GuidedRouteRoleV3) {
  const combat = contains(text, ["attack", "damage", "dmg", "speed", "crit", "bullet"]);
  const utility = contains(text, ["sp", "summon", "merge", "slow", "lock", "delay", "hp", "heal", "shield"]);
  if (role === "dealer") return combat ? 3.2 : utility ? 0.5 : 1;
  if (role === "support") return utility ? 3.2 : combat ? 0.7 : 1;
  return combat || utility ? 2 : 1;
}

function costUnits(cost: TreeCost) {
  return Math.max(0.5, cost.gold / 2_000 + cost.stone * 8 + (cost.solarCore ?? 0) * 8);
}

function affordable(cost: TreeCost, remaining: TreeCost) {
  return cost.gold <= remaining.gold
    && cost.stone <= remaining.stone
    && (cost.solarCore ?? 0) <= (remaining.solarCore ?? 0);
}

function rankPurchases(route: NonNullable<ReturnType<typeof planNextRankRouteV3>>) {
  return route.steps.reduce((total, step) => total + step.toRank - step.fromRank, 0);
}

function reasonCodes(
  node: DiceTreeNodeV3,
  scopeReason: string,
  focus: ReturnType<typeof focusScore>,
  settings: GuidedRouteSettingsV3,
) {
  const reasons = [scopeReason, `focus-${settings.focus}`, `role-${settings.role}`];
  if (settings.style === "efficient") reasons.push("cost-efficient");
  if (settings.style === "power") reasons.push("power-priority");
  if (settings.style === "specialized" || node.targetId === settings.diceId) reasons.push("specialized-path");
  if (focus.damage) reasons.push("damage-effect");
  if (focus.speed) reasons.push("speed-effect");
  if (focus.critical) reasons.push("critical-effect");
  if (focus.economy) reasons.push("economy-effect");
  if (focus.survival) reasons.push("survival-effect");
  return [...new Set(reasons)];
}

function validatePlan(
  data: CanonicalGameData,
  startingRanks: Record<string, number>,
  steps: readonly GuidedRouteStepV3[],
  totalCost: TreeCost,
  budget: TreeCost,
) {
  const byId = new Map(data.tree.map((node) => [node.id, node]));
  const ranks = { ...startingRanks };
  let recalculated: TreeCost = { ...ZERO_TREE_COST };
  let prerequisitesSatisfied = true;
  let exactCosts = true;
  for (const step of steps) {
    const node = byId.get(step.nodeId);
    if (!node) {
      prerequisitesSatisfied = false;
      exactCosts = false;
      continue;
    }
    if (!node.prerequisites.every((prerequisite) => (ranks[prerequisite.nodeId] ?? 0) >= prerequisite.minRank)) {
      prerequisitesSatisfied = false;
    }
    const cost = treeCostForRange(node, step.fromRank, step.toRank);
    recalculated = addTreeCosts(recalculated, cost);
    if (cost.gold !== step.cost.gold || cost.stone !== step.cost.stone || (cost.solarCore ?? 0) !== (step.cost.solarCore ?? 0)) exactCosts = false;
    ranks[step.nodeId] = step.toRank;
  }
  exactCosts = exactCosts && recalculated.gold === totalCost.gold && recalculated.stone === totalCost.stone && (recalculated.solarCore ?? 0) === (totalCost.solarCore ?? 0);
  return {
    prerequisitesSatisfied,
    exactCosts,
    withinBudget: totalCost.gold <= budget.gold && totalCost.stone <= budget.stone && (totalCost.solarCore ?? 0) <= (budget.solarCore ?? 0),
  };
}

export function planGuidedRouteV3(data: CanonicalGameData, settings: GuidedRouteSettingsV3): GuidedRoutePlanV3 {
  const selectedDice = data.dice.find((dice) => dice.id === settings.diceId);
  if (!selectedDice) throw new Error(`Unknown dice id: ${settings.diceId}`);
  const maxPurchases = LENGTH_LIMITS[settings.length];
  const ranks = { ...settings.currentRanks };
  const remaining = { ...settings.budget };
  const steps: GuidedRouteStepV3[] = [];
  const targetRanks: Record<string, number> = {};
  const targetHistory = new Map<string, number>();
  let totalCost: TreeCost = { ...ZERO_TREE_COST };
  let purchases = 0;
  const variant = Math.max(0, settings.variant ?? 0) % 3;
  const enforceBudget = settings.budgetMode !== "virtual";

  // Start specialized plans on the shortest legal path toward the selected
  // dice. When the full target is not yet affordable, the affordable prefix
  // is still recommended so the plan never drifts into an unrelated branch.
  if (settings.focus === "selected-dice" || settings.style === "specialized") {
    const anchor = data.tree
      .filter((node) => node.targetId === settings.diceId && (ranks[node.id] ?? 0) < node.maxRank)
      .map((node) => ({ node, route: planNextRankRouteV3(data.tree, ranks, node.id) }))
      .filter((entry): entry is { node: DiceTreeNodeV3; route: NonNullable<ReturnType<typeof planNextRankRouteV3>> } => Boolean(entry.route))
      .sort((a, b) => rankPurchases(a.route) - rankPurchases(b.route) || a.route.totalCost.gold - b.route.totalCost.gold || a.node.id.localeCompare(b.node.id))[0];
    if (anchor) {
      for (const routeStep of anchor.route.steps) {
        const delta = routeStep.toRank - routeStep.fromRank;
        if (purchases + delta > maxPurchases || (enforceBudget && !affordable(routeStep.cost, remaining))) break;
        steps.push({
          order: steps.length + 1,
          nodeId: routeStep.nodeId,
          fromRank: routeStep.fromRank,
          toRank: routeStep.toRank,
          cost: routeStep.cost,
          prerequisite: !routeStep.target,
          reasons: routeStep.target ? ["selected-dice", "specialized-path"] : ["required-prerequisite", "selected-dice-path"],
        });
        ranks[routeStep.nodeId] = routeStep.toRank;
        targetRanks[routeStep.nodeId] = routeStep.toRank;
        purchases += delta;
        totalCost = addTreeCosts(totalCost, routeStep.cost);
        remaining.gold -= routeStep.cost.gold;
        remaining.stone -= routeStep.cost.stone;
        if (remaining.solarCore !== undefined || routeStep.cost.solarCore !== undefined) {
          remaining.solarCore = (remaining.solarCore ?? 0) - (routeStep.cost.solarCore ?? 0);
        }
      }
    }
  }

  while (purchases < maxPurchases) {
    const candidates = data.tree.flatMap((node) => {
      if (node.kind === "connector" || (ranks[node.id] ?? 0) >= node.maxRank) return [];
      const route = planNextRankRouteV3(data.tree, ranks, node.id);
      if (!route || (enforceBudget && !affordable(route.totalCost, remaining))) return [];
      const routePurchases = rankPurchases(route);
      if (routePurchases <= 0 || purchases + routePurchases > maxPurchases) return [];
      const text = nodeSemantics(node);
      const focus = focusScore(text, settings.focus);
      const scope = scopeScore(node, data, settings.diceId, selectedDice.family);
      if (scope.score < 0.1) return [];
      const role = roleScore(text, settings.role);
      const repeatPenalty = 1 + (targetHistory.get(node.id) ?? 0) * (settings.style === "specialized" ? 0.08 : 0.32);
      const routePenalty = 1 + Math.max(0, routePurchases - 1) * 0.12;
      const units = costUnits(route.totalCost);
      const efficiencyExponent = settings.style === "efficient" || variant === 1 ? 1.2 : settings.style === "power" ? 0.3 : 0.65;
      const specialization = settings.style === "specialized" && (node.targetId === settings.diceId || node.family === selectedDice.family) ? 1.7 : 1;
      const diversity = variant === 2 && !targetHistory.has(node.id) ? 1.5 : 1;
      const deterministicVariant = 1 + (((node.id.length * 17 + node.id.charCodeAt(0)) % 11) / 100) * variant;
      const score = scope.score * focus.score * role * specialization * diversity * deterministicVariant
        / Math.pow(units, efficiencyExponent) / routePenalty / repeatPenalty;
      return [{ node, route, score, reasons: reasonCodes(node, scope.reason, focus, settings) }];
    }).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));

    const directSpecialization = purchases === 0 && (settings.focus === "selected-dice" || settings.style === "specialized")
      ? candidates.find((candidate) => candidate.node.targetId === settings.diceId)
      : undefined;
    const chosen = directSpecialization ?? candidates[0];
    if (!chosen || chosen.score <= 0) break;
    for (const routeStep of chosen.route.steps) {
      const nodeReasons = routeStep.target ? chosen.reasons : ["required-prerequisite"];
      steps.push({
        order: steps.length + 1,
        nodeId: routeStep.nodeId,
        fromRank: routeStep.fromRank,
        toRank: routeStep.toRank,
        cost: routeStep.cost,
        prerequisite: !routeStep.target,
        reasons: nodeReasons,
      });
      ranks[routeStep.nodeId] = routeStep.toRank;
      targetRanks[routeStep.nodeId] = routeStep.toRank;
      purchases += routeStep.toRank - routeStep.fromRank;
    }
    totalCost = addTreeCosts(totalCost, chosen.route.totalCost);
    remaining.gold -= chosen.route.totalCost.gold;
    remaining.stone -= chosen.route.totalCost.stone;
    if (remaining.solarCore !== undefined || chosen.route.totalCost.solarCore !== undefined) {
      remaining.solarCore = (remaining.solarCore ?? 0) - (chosen.route.totalCost.solarCore ?? 0);
    }
    targetHistory.set(chosen.node.id, (targetHistory.get(chosen.node.id) ?? 0) + 1);
  }

  const summaryReasons = [
    `role-${settings.role}`,
    `focus-${settings.focus}`,
    `style-${settings.style}`,
    "prerequisite-complete",
    enforceBudget ? "budget-checked" : "virtual-shortfall-visible",
  ];
  const tradeoffs = settings.style === "efficient"
    ? ["slower-peak-power", "maximizes-early-value"]
    : settings.style === "power"
      ? ["higher-resource-spikes", "prioritizes-impact"]
      : ["narrower-coverage", "prioritizes-selected-dice"];
  const linkedEffects = steps.filter((step) => data.tree.find((node) => node.id === step.nodeId)?.passiveOrRuneRef);
  const confidence = linkedEffects.length > 0 && linkedEffects.every((step) => {
    const linked = data.tree.find((node) => node.id === step.nodeId)?.passiveOrRuneRef;
    if (linked?.startsWith("passive:")) return data.passives.find((passive) => passive.id === linked.slice(8))?.confidence === "verified";
    if (linked?.startsWith("rune:")) return data.runes.find((rune) => rune.id === linked.slice(5))?.confidence === "verified";
    return false;
  }) ? "verified-effects" : "structural";
  const diceTargets = data.tree.filter((node) => node.targetId === settings.diceId);
  const reachedTarget = diceTargets.find((node) => (ranks[node.id] ?? 0) > (settings.currentRanks[node.id] ?? 0));
  const remainingTargetRoute = reachedTarget ? null : diceTargets
    .map((node) => ({ node, route: planNextRankRouteV3(data.tree, ranks, node.id) }))
    .filter((entry) => entry.route)
    .sort((a, b) => rankPurchases(a.route!) - rankPurchases(b.route!))[0];
  const stopReason = reachedTarget || !diceTargets.length
    ? (!diceTargets.length ? "no-target-node" as const : undefined)
    : purchases >= maxPurchases
      ? "length" as const
      : enforceBudget && remainingTargetRoute?.route && !affordable(remainingTargetRoute.route.totalCost, remaining)
        ? "budget" as const
        : undefined;

  return {
    settings,
    steps,
    targetRanks,
    totalCost,
    remaining,
    summaryReasons,
    tradeoffs,
    validity: validatePlan(data, settings.currentRanks, steps, totalCost, settings.budget),
    confidence,
    goal: {
      reached: Boolean(reachedTarget),
      ...(reachedTarget ? { targetNodeId: reachedTarget.id } : remainingTargetRoute ? { targetNodeId: remainingTargetRoute.node.id } : {}),
      progressSteps: steps.filter((step) => step.reasons.includes("selected-dice-path") || step.reasons.includes("selected-dice")).length,
      ...(stopReason ? { stopReason } : {}),
    },
  };
}
