import type { TreeCost } from "../game-data/types";
import type { SimulationInputV3 } from "../simulation/engine/types";
import type { IntelligenceCommandV64, IntelligenceGoalV63, IntelligenceRequestV63 } from "./types";

export const ANALYSIS_STATE_SCHEMA_V65 = 2 as const;
export const INTELLIGENCE_OPTIMIZER_VERSION_V65 = "v65.1";

export interface AnalysisBaseStateV65 {
  input: SimulationInputV3;
  resources: TreeCost;
  deckIds: string[];
  goal: IntelligenceGoalV63;
  purchaseLimit: number;
}

export interface AnalysisScenarioOverridesV65 {
  resourceDelta?: Partial<TreeCost>;
  goal?: IntelligenceGoalV63;
  purchaseLimit?: number;
  targetDiceId?: string;
  assumedTreeRanks?: Record<string, number>;
  deckIds?: string[];
  input?: Omit<SimulationInputV3, "diceId" | "treeRanks">;
}

export interface AnalysisStateV65 {
  schemaVersion: typeof ANALYSIS_STATE_SCHEMA_V65;
  base: AnalysisBaseStateV65;
  scenario: {
    id: string;
    name?: string;
    overrides: AnalysisScenarioOverridesV65;
  };
  selection: {
    nodeId?: string;
    alternativeId?: string;
  };
}

export interface EffectiveAnalysisStateV65 {
  input: SimulationInputV3;
  resources: TreeCost;
  deckIds: string[];
  goal: IntelligenceGoalV63;
  purchaseLimit: number;
}

export type AnalysisStateActionV65 =
  | { type: "replace-base"; base: AnalysisBaseStateV65 }
  | { type: "apply-command"; command: IntelligenceCommandV64 }
  | { type: "set-resource"; kind: keyof TreeCost; value: number }
  | { type: "add-resources"; delta: Partial<TreeCost> }
  | { type: "set-goal"; goal: IntelligenceGoalV63 }
  | { type: "set-purchase-limit"; purchaseLimit: number }
  | { type: "set-target-dice"; targetDiceId: string }
  | { type: "restore-request"; request: IntelligenceRequestV63 }
  | { type: "reset-scenario" }
  | { type: "select-node"; nodeId?: string }
  | { type: "select-alternative"; alternativeId?: string };

function safeResource(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

export function normalizeTreeCostV65(cost: TreeCost): TreeCost {
  return {
    gold: safeResource(cost.gold),
    stone: safeResource(cost.stone),
    solarCore: safeResource(cost.solarCore ?? 0),
  };
}

export function addTreeCostDeltaV65(base: TreeCost, delta: Partial<TreeCost> = {}): TreeCost {
  return normalizeTreeCostV65({
    gold: base.gold + (delta.gold ?? 0),
    stone: base.stone + (delta.stone ?? 0),
    solarCore: (base.solarCore ?? 0) + (delta.solarCore ?? 0),
  });
}

function compactDelta(delta: Partial<TreeCost>): Partial<TreeCost> | undefined {
  const next = Object.fromEntries(Object.entries(delta).filter(([, value]) => value !== 0)) as Partial<TreeCost>;
  return Object.keys(next).length ? next : undefined;
}

export function createAnalysisStateV65(base: AnalysisBaseStateV65): AnalysisStateV65 {
  return {
    schemaVersion: ANALYSIS_STATE_SCHEMA_V65,
    base: { ...base, resources: normalizeTreeCostV65(base.resources), deckIds: [...base.deckIds] },
    scenario: { id: crypto.randomUUID(), overrides: {} },
    selection: {},
  };
}

export function selectEffectiveAnalysisV65(state: AnalysisStateV65): EffectiveAnalysisStateV65 {
  const overrides = state.scenario.overrides;
  return {
    input: {
      ...state.base.input,
      ...(overrides.input ?? {}),
      diceId: overrides.targetDiceId ?? state.base.input.diceId,
      treeRanks: { ...state.base.input.treeRanks, ...(overrides.assumedTreeRanks ?? {}) },
    },
    resources: addTreeCostDeltaV65(state.base.resources, overrides.resourceDelta),
    deckIds: [...(overrides.deckIds ?? state.base.deckIds)],
    goal: overrides.goal ?? state.base.goal,
    purchaseLimit: overrides.purchaseLimit ?? state.base.purchaseLimit,
  };
}

export function analysisRequestFromStateV65(state: AnalysisStateV65, dataVersion: string): IntelligenceRequestV63 {
  const effective = selectEffectiveAnalysisV65(state);
  return {
    schemaVersion: 1,
    dataVersion,
    input: effective.input,
    resources: effective.resources,
    goal: effective.goal,
    maxPurchases: effective.purchaseLimit,
    activeDeckIds: effective.deckIds,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, stableValue(entry)]));
}

export function stableSerializeAnalysisRequestV65(request: IntelligenceRequestV63) {
  return JSON.stringify(stableValue(request));
}

export function analysisRevisionIdV65(request: IntelligenceRequestV63) {
  const source = stableSerializeAnalysisRequestV65(request);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `analysis:${hash.toString(16).padStart(16, "0")}`;
}

export function hasScenarioOverridesV65(state: AnalysisStateV65) {
  const overrides = state.scenario.overrides;
  return Boolean(overrides.goal || overrides.purchaseLimit || overrides.targetDiceId || overrides.deckIds !== undefined
    || overrides.input || Object.keys(overrides.resourceDelta ?? {}).length || Object.keys(overrides.assumedTreeRanks ?? {}).length);
}

function resourceDeltaForValue(base: TreeCost, kind: keyof TreeCost, value: number) {
  return safeResource(value) - (base[kind] ?? 0);
}

export function analysisStateReducerV65(state: AnalysisStateV65, action: AnalysisStateActionV65): AnalysisStateV65 {
  if (action.type === "replace-base") return {
    ...state,
    base: { ...action.base, resources: normalizeTreeCostV65(action.base.resources), deckIds: [...action.base.deckIds] },
  };
  if (action.type === "reset-scenario") return {
    ...state,
    scenario: { id: crypto.randomUUID(), overrides: {} },
    selection: {},
  };
  if (action.type === "select-node") return { ...state, selection: { ...state.selection, nodeId: action.nodeId } };
  if (action.type === "select-alternative") return { ...state, selection: { ...state.selection, alternativeId: action.alternativeId } };

  const overrides = { ...state.scenario.overrides };
  if (action.type === "set-resource") {
    overrides.resourceDelta = compactDelta({
      ...(overrides.resourceDelta ?? {}),
      [action.kind]: resourceDeltaForValue(state.base.resources, action.kind, action.value),
    });
  } else if (action.type === "add-resources") {
    overrides.resourceDelta = compactDelta({
      ...(overrides.resourceDelta ?? {}),
      gold: (overrides.resourceDelta?.gold ?? 0) + (action.delta.gold ?? 0),
      stone: (overrides.resourceDelta?.stone ?? 0) + (action.delta.stone ?? 0),
      solarCore: (overrides.resourceDelta?.solarCore ?? 0) + (action.delta.solarCore ?? 0),
    });
  } else if (action.type === "set-goal") {
    overrides.goal = action.goal === state.base.goal ? undefined : action.goal;
  } else if (action.type === "set-purchase-limit") {
    overrides.purchaseLimit = action.purchaseLimit === state.base.purchaseLimit ? undefined : action.purchaseLimit;
  } else if (action.type === "set-target-dice") {
    overrides.targetDiceId = action.targetDiceId === state.base.input.diceId ? undefined : action.targetDiceId;
  } else if (action.type === "apply-command") {
    if (action.command.goal) overrides.goal = action.command.goal === state.base.goal ? undefined : action.command.goal;
    if (action.command.maxPurchases) overrides.purchaseLimit = action.command.maxPurchases === state.base.purchaseLimit ? undefined : action.command.maxPurchases;
    if (action.command.targetDiceId) overrides.targetDiceId = action.command.targetDiceId === state.base.input.diceId ? undefined : action.command.targetDiceId;
    const delta = { ...(overrides.resourceDelta ?? {}) };
    for (const kind of ["gold", "stone", "solarCore"] as const) {
      if (action.command.resourceOverride?.[kind] !== undefined) delta[kind] = resourceDeltaForValue(state.base.resources, kind, action.command.resourceOverride[kind]!);
      if (action.command.resourceDelta?.[kind] !== undefined) delta[kind] = (delta[kind] ?? 0) + action.command.resourceDelta[kind]!;
    }
    overrides.resourceDelta = compactDelta(delta);
  } else if (action.type === "restore-request") {
    overrides.goal = action.request.goal === state.base.goal ? undefined : action.request.goal;
    overrides.purchaseLimit = action.request.maxPurchases === state.base.purchaseLimit ? undefined : action.request.maxPurchases;
    overrides.targetDiceId = action.request.input.diceId === state.base.input.diceId ? undefined : action.request.input.diceId;
    overrides.deckIds = JSON.stringify(action.request.activeDeckIds) === JSON.stringify(state.base.deckIds) ? undefined : [...action.request.activeDeckIds];
    overrides.resourceDelta = compactDelta({
      gold: action.request.resources.gold - state.base.resources.gold,
      stone: action.request.resources.stone - state.base.resources.stone,
      solarCore: (action.request.resources.solarCore ?? 0) - (state.base.resources.solarCore ?? 0),
    });
    const rankOverrides = Object.fromEntries([...new Set([...Object.keys(state.base.input.treeRanks), ...Object.keys(action.request.input.treeRanks)])]
      .filter((nodeId) => (state.base.input.treeRanks[nodeId] ?? 0) !== (action.request.input.treeRanks[nodeId] ?? 0))
      .map((nodeId) => [nodeId, action.request.input.treeRanks[nodeId] ?? 0]));
    overrides.assumedTreeRanks = Object.keys(rankOverrides).length ? rankOverrides : undefined;
    const { diceId: savedDiceId, treeRanks: savedRanks, ...savedInput } = action.request.input;
    const { diceId: baseDiceId, treeRanks: baseRanks, ...baseInput } = state.base.input;
    void savedDiceId; void savedRanks; void baseDiceId; void baseRanks;
    overrides.input = JSON.stringify(stableValue(savedInput)) === JSON.stringify(stableValue(baseInput)) ? undefined : savedInput;
  }
  return { ...state, scenario: { ...state.scenario, overrides } };
}
