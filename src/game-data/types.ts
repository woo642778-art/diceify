export type DiceFamilyV3 = "order" | "chaos" | "magic" | "engineering" | "nature";
export type CalculationConfidence = "verified" | "partial";
export type SourceKindV3 = "ipa-table" | "ipa-localization" | "ipa-asset" | "il2cpp-code-path";

export interface LocalizedTextV3 {
  ko: string;
  en: string;
}

export interface SourceRefV3 {
  id: string;
  kind: SourceKindV3;
  table?: string;
  rowId?: string | number;
  field?: string;
  notes?: string;
}

/**
 * `stone` is the client table field family (`RankUpStoneArr`). The in-game
 * localized display name is `다이스 코어` / `Dice Core`.
 */
export interface TreeCost {
  gold: number;
  stone: number;
  /** Solar-specific core introduced by the 1.1.0 client. */
  solarCore?: number;
}

export interface GameManifest {
  schemaVersion: 3;
  clientVersion: string;
  sourceSha256: string;
  extractorVersion: string;
  extractedAt: string;
}

export interface DiceGrowthRuleV3 {
  stat: string;
  operation: "add" | "multiply" | "replace";
  perLevel: number;
  confidence: CalculationConfidence;
  sourceRefs: string[];
}

export interface DiceBaseStatsV3 {
  attack?: number;
  attackInterval?: number;
  range?: number;
  bossMultiplier?: number;
  extra: Record<string, number | string | boolean>;
}

export interface DiceDefinitionV3 {
  id: string;
  numericId?: number;
  family?: DiceFamilyV3;
  nameKey?: string;
  descriptionKey?: string;
  iconAsset?: string;
  baseStats: DiceBaseStatsV3;
  levelGrowth: DiceGrowthRuleV3[];
  battleUpgradeGrowth: DiceGrowthRuleV3[];
  mechanicRuleId?: string;
  sourceRefs: string[];
}

export interface DiceTreeNodeV3 {
  id: string;
  family: DiceFamilyV3 | "core";
  kind: "dice" | "passive" | "perk" | "milestone" | "connector";
  position: { x: number; y: number };
  prerequisites: Array<{ nodeId: string; minRank: number }>;
  targetId?: string | null;
  maxRank: number;
  costsByRank: TreeCost[];
  zeroCostRanks?: number[];
  passiveOrRuneRef?: string | null;
  nameKey?: string | null;
  descriptionKey?: string | null;
  sourceRefs: string[];
}

export interface PassiveDefinitionV3 {
  id: string;
  numericId?: number;
  scope: "global" | DiceFamilyV3 | "dice";
  targetDiceIds?: string[];
  maxRank: number;
  baseValue?: number | null;
  valuePerRank?: number | null;
  valueType?: string | null;
  statKey?: string;
  nameKey?: string | null;
  descriptionKey?: string | null;
  confidence: CalculationConfidence;
  sourceRefs: string[];
}

export interface RuneDefinitionV3 {
  id: string;
  kind?: string;
  grade?: string;
  maxRank?: number;
  targetDiceId?: string | null;
  targetDiceIds?: string[];
  values: Record<string, number | string | boolean>;
  nameKey?: string | null;
  descriptionKey?: string | null;
  confidence: CalculationConfidence;
  sourceRefs: string[];
}

export interface EnemyDefinitionV3 {
  id: string;
  kind: "normal" | "elite" | "boss";
  bossType?: string | null;
  nameKey?: string | null;
  hp?: number;
  hpMultiplierPercent?: number | null;
  speed?: number | null;
  sp?: number | null;
  trophyLevel?: number | null;
  values: Record<string, number | string | boolean>;
  confidence: CalculationConfidence;
  sourceRefs: string[];
}

export interface MechanicEvidenceV3 {
  key: string;
  symbols: string[];
  present: boolean;
  confidence: CalculationConfidence;
  formula: string | null;
  parameters?: Record<string, number | string | boolean>;
  sourceRefs: string[];
}

export interface CanonicalGameData {
  manifest: GameManifest;
  dice: DiceDefinitionV3[];
  tree: DiceTreeNodeV3[];
  passives: PassiveDefinitionV3[];
  runes: RuneDefinitionV3[];
  enemies: EnemyDefinitionV3[];
  localization: {
    ko: Record<string, string>;
    en: Record<string, string>;
  };
  sources?: SourceRefV3[];
}
