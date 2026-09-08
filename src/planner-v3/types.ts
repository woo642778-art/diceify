export interface SimulationScenarioState {
  diceId: string;
  diceProgressionLevel: number;
  battleUpgradeLevel: number;
  conditionValues: Record<string, number | boolean | string>;
  enemyPresetId: string;
  enemyHpOverride?: number;
  durationSeconds: number;
}

export interface PlannerStateV3 {
  schemaVersion: 3;
  dataVersion: string;
  ownedRanks: Record<string, number>;
  /** Sparse target ranks. Missing entries mean the simulated target equals the owned rank. */
  simulatedRanks: Record<string, number>;
  inventory: {
    gold: number;
    /** Internal client lineage name for the in-game Dice Core currency. */
    stone: number;
    /** Solar Core, introduced for Solar Dice Tree ranks in client 1.1.0. */
    solarCore?: number;
  };
  scenario: SimulationScenarioState;
}

export interface PlannerHistoryV3 {
  past: PlannerStateV3[];
  present: PlannerStateV3;
  future: PlannerStateV3[];
}

export type PlannerActionV3 =
  | { type: "setOwnedRank"; nodeId: string; rank: number }
  | { type: "setSimulatedRank"; nodeId: string; rank: number }
  | { type: "applyRoute"; ranks: Record<string, number> }
  | { type: "clearSimulatedRanks" }
  | { type: "resetTreeProgress" }
  | { type: "incrementSimulatedRank"; nodeId: string }
  | { type: "decrementSimulatedRank"; nodeId: string }
  | { type: "setInventory"; inventory: Partial<PlannerStateV3["inventory"]> }
  | { type: "setScenario"; scenario: Partial<SimulationScenarioState> }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "resetSimulation" }
  | { type: "load"; state: PlannerStateV3 };

export interface PlannerNodeLimitsV3 {
  validNodeIds: ReadonlySet<string>;
  maxRanks: ReadonlyMap<string, number>;
  prerequisites?: ReadonlyMap<string, readonly { nodeId: string; minRank: number }[]>;
  /** Ranks granted by the game before the player spends any tree currency. */
  minimumOwnedRanks?: ReadonlyMap<string, number>;
}
