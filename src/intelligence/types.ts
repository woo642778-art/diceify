import type { CalculationConfidence, TreeCost } from "../game-data/types";
import type { SimulationInputV3 } from "../simulation/engine/types";

export type IntelligenceGoalV63 =
  | "basic-dps"
  | "resource-efficiency"
  | "target-dice"
  | "pvp"
  | "coop";

export interface IntelligenceRequestV63 {
  schemaVersion: 1;
  dataVersion: string;
  input: SimulationInputV3;
  resources: TreeCost;
  goal: IntelligenceGoalV63;
  /** Exact search horizon. Every feasible path up to this many rank purchases is visited. */
  maxPurchases: number;
  activeDeckIds: string[];
}

export interface IntelligenceMetricV63 {
  id: "basic-attack-dps" | "practical-dps";
  before: number;
  after: number;
  absoluteGain: number;
  percentGain: number | null;
  confidence: CalculationConfidence;
  limitation?: string;
}

export interface IntelligenceRouteStepV63 {
  nodeId: string;
  fromRank: number;
  toRank: number;
  cost: TreeCost;
  reason: "verified-gain" | "prerequisite" | "target-dice" | "frontier";
}

export interface IntelligenceRouteV63 {
  id: string;
  rankChanges: Record<string, number>;
  steps: IntelligenceRouteStepV63[];
  cost: TreeCost;
  remaining: TreeCost;
  metrics: IntelligenceMetricV63[];
  confidence: CalculationConfidence;
  sourceRefs: string[];
  warnings: string[];
  score: number | null;
}

export type IntelligenceOverlayStateV63 =
  | "owned"
  | "next"
  | "later"
  | "alternative"
  | "unaffordable"
  | "low-efficiency";

export interface IntelligenceSearchEvidenceV63 {
  algorithm: "exact-dfs-pareto";
  complete: boolean;
  horizon: number;
  candidateNodeRanks: number;
  visitedStates: number;
  deduplicatedStates: number;
  prunedDominated: number;
  elapsedMs: number;
  scope: string;
}

export interface IntelligenceBreakpointV63 {
  affordableNow: boolean;
  nextCost: TreeCost | null;
  shortage: TreeCost;
  decision: "spend" | "save" | "no-verified-gain";
}

export interface IntelligenceResultV63 {
  schemaVersion: 1;
  dataVersion: string;
  calculatedAt: string;
  goal: IntelligenceGoalV63;
  primary: IntelligenceRouteV63 | null;
  alternatives: IntelligenceRouteV63[];
  paretoFront: IntelligenceRouteV63[];
  overlay: Record<string, IntelligenceOverlayStateV63>;
  breakpoint: IntelligenceBreakpointV63;
  search: IntelligenceSearchEvidenceV63;
  limitations: string[];
}

export interface MetaEvidenceV63 {
  snapshotDate: string;
  clientVersion: string;
  source: string;
  sampleSize: number;
  confidence: CalculationConfidence;
  limitation: string;
}

export interface SavedIntelligenceRecommendationV63 {
  schemaVersion: 1;
  id: string;
  name: string;
  savedAt: string;
  dataVersion: string;
  request: IntelligenceRequestV63;
  result: IntelligenceResultV63;
}

export type IntelligenceResourceKindV64 = "gold" | "stone" | "solarCore";

export interface IntelligenceCommandV64 {
  tool: "calculate_route" | "compare_routes" | "find_breakpoint" | "explain_result";
  goal?: IntelligenceGoalV63;
  maxPurchases?: number;
  targetDiceId?: string;
  targetNodeId?: string;
  comparisonNodeId?: string;
  resourceDelta?: Partial<Record<IntelligenceResourceKindV64, number>>;
  resourceOverride?: Partial<Record<IntelligenceResourceKindV64, number>>;
  confidence: "high" | "ambiguous";
  matched: string[];
}
