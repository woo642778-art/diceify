import type { CanonicalGameData, TreeCost } from "../game-data/types";
import { addTreeCosts, ZERO_TREE_COST } from "../planner-v3/costs";
import { planNextRankRouteV3 } from "../planner-v3/routes";
import type { GuidedRoutePlanV3, GuidedRouteStepV3 } from "./planGuidedRouteV3";

export interface GrowthRoadmapStageV3 {
  id: "foundation" | "core" | "complete";
  steps: GuidedRouteStepV3[];
  cost: TreeCost;
  remaining: TreeCost;
  purpose: { ko: string; en: string };
}

export interface GrowthRoadmapV3 {
  stages: GrowthRoadmapStageV3[];
  reserve: {
    shouldSave: boolean;
    targetNodeId?: string;
    shortfall: TreeCost;
    reason: { ko: string; en: string };
  };
}

function sumCost(steps: readonly GuidedRouteStepV3[]) {
  return steps.reduce((cost, step) => addTreeCosts(cost, step.cost), {
    ...ZERO_TREE_COST,
  });
}

export function buildGrowthRoadmapV3(
  data: CanonicalGameData,
  plan: GuidedRoutePlanV3,
): GrowthRoadmapV3 {
  const count = plan.steps.length;
  const firstEnd = Math.ceil(count / 3);
  const secondEnd = Math.ceil((count * 2) / 3);
  const chunks = [
    plan.steps.slice(0, firstEnd),
    plan.steps.slice(firstEnd, secondEnd),
    plan.steps.slice(secondEnd),
  ];
  const definitions: Array<Pick<GrowthRoadmapStageV3, "id" | "purpose">> = [
    {
      id: "foundation",
      purpose: {
        ko: "선행 조건과 저비용 기반 효과를 먼저 열어 다음 분기의 진입 비용을 확정합니다.",
        en: "Secure prerequisites and low-cost foundations so later branch costs are known.",
      },
    },
    {
      id: "core",
      purpose: {
        ko: "선택한 역할과 중심 주사위에 직접 기여하는 핵심 효과를 확보합니다.",
        en: "Acquire core effects that directly serve the selected role and primary dice.",
      },
    },
    {
      id: "complete",
      purpose: {
        ko: "목표 노드까지 완주하고 남은 예산을 높은 우선순위 효과에 배분합니다.",
        en: "Finish the target route and allocate the remaining budget to high-priority effects.",
      },
    },
  ];
  let cumulative: TreeCost = { ...ZERO_TREE_COST };
  const tracksSolarCore =
    (plan.settings.budget.solarCore ?? 0) > 0 ||
    (plan.totalCost.solarCore ?? 0) > 0 ||
    (plan.remaining.solarCore ?? 0) > 0;
  const stages = definitions.map((definition, index) => {
    const steps = chunks[index];
    const cost = sumCost(steps);
    cumulative = addTreeCosts(cumulative, cost);
    return {
      ...definition,
      steps,
      cost,
      remaining: {
        gold: Math.max(0, plan.settings.budget.gold - cumulative.gold),
        stone: Math.max(0, plan.settings.budget.stone - cumulative.stone),
        ...(tracksSolarCore
          ? {
              solarCore: Math.max(
                0,
                (plan.settings.budget.solarCore ?? 0) -
                  (cumulative.solarCore ?? 0),
              ),
            }
          : {}),
      },
    };
  });

  const finalRanks = { ...plan.settings.currentRanks, ...plan.targetRanks };
  const targetNodeId = plan.goal.targetNodeId;
  const route = targetNodeId
    ? planNextRankRouteV3(data.tree, finalRanks, targetNodeId)
    : null;
  const routeTracksSolarCore =
    tracksSolarCore || (route?.totalCost.solarCore ?? 0) > 0;
  const shortfall = route
    ? {
        gold: Math.max(0, route.totalCost.gold - plan.remaining.gold),
        stone: Math.max(0, route.totalCost.stone - plan.remaining.stone),
        ...(routeTracksSolarCore
          ? {
              solarCore: Math.max(
                0,
                (route.totalCost.solarCore ?? 0) -
                  (plan.remaining.solarCore ?? 0),
              ),
            }
          : {}),
      }
    : { ...ZERO_TREE_COST };
  const shouldSave = Boolean(
    route &&
    (shortfall.gold > 0 ||
      shortfall.stone > 0 ||
      (shortfall.solarCore ?? 0) > 0),
  );
  return {
    stages,
    reserve: {
      shouldSave,
      ...(targetNodeId ? { targetNodeId } : {}),
      shortfall,
      reason: shouldSave
        ? {
            ko: "남은 재화를 주변 노드에 분산하면 목표 전용 노드 도달이 늦어집니다. 부족분을 먼저 비축하는 편이 경로 완주에 유리합니다.",
            en: "Spending the remainder on side nodes delays the dedicated target. Save the shortfall to finish the route first.",
          }
        : {
            ko: "현재 계획은 목표 경로 비용을 충족하므로 단계 순서대로 투자해도 됩니다.",
            en: "The current plan covers the target route, so the staged order is safe to follow.",
          },
    },
  };
}
