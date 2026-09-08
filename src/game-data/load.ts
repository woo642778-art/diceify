import manifestJson from "./manifest.json";
import diceCompact from "./dice.compact.json";
import tree01 from "./tree.compact.01.json";
import tree02 from "./tree.compact.02.json";
import tree03 from "./tree.compact.03.json";
import tree04 from "./tree.compact.04.json";
import tree05 from "./tree.compact.05.json";
import tree06 from "./tree.compact.06.json";
import passives01 from "./passives.compact.01.json";
import passives02 from "./passives.compact.02.json";
import runes01 from "./runes.compact.01.json";
import runes02 from "./runes.compact.02.json";
import runes03 from "./runes.compact.03.json";
import runes04 from "./runes.compact.04.json";
import enemiesJson from "./enemies.json";
import localization01 from "./localization.compact.01.json";
import localization02 from "./localization.compact.02.json";
import localization03 from "./localization.compact.03.json";
import localization04 from "./localization.compact.04.json";
import localization05 from "./localization.compact.05.json";
import mechanicEvidenceJson from "./mechanic-evidence.json";
import wavesJson from "./waves.json";
import type {
  CalculationConfidence,
  CanonicalGameData,
  DiceDefinitionV3,
  DiceFamilyV3,
  DiceGrowthRuleV3,
  DiceTreeNodeV3,
  EnemyDefinitionV3,
  GameManifest,
  MechanicEvidenceV3,
  PassiveDefinitionV3,
  RuneDefinitionV3,
} from "./types";
import { validateCanonicalGameData } from "./validate";

type DiceCompactRow = [
  string, number | null, DiceFamilyV3 | null, string | null, string | null,
  number | null, number | null, number | null, number | null,
  number | null, number | null, number | null,
  number | null, number | null, number | null, number | null,
  string | null, string | null, string | null, string | null, string | null, number | null,
];

type TreeCompactRow = [
  string, DiceFamilyV3 | "core", DiceTreeNodeV3["kind"], number, number,
  Array<string | [string, number]>, string | null, number, Array<[number, number] | [number, number, number]>, string | null, string | null, string | null,
];

type PassiveCompactRow = [
  string, number | null, "global" | DiceFamilyV3 | "dice", number,
  number | null, number | null, string | null, string | null, string | null,
];

type RuneCompactRow = [
  string, string | null, string | null, number | null, string | null,
  Record<string, number | string | boolean>, string | null, string | null,
];

type LocalizationCompact = Record<string, [string, string]>;

function growthRule(
  stat: string,
  perLevel: number | null,
  sourceRef: string,
): DiceGrowthRuleV3[] {
  if (perLevel === null) return [];
  return [{
    stat,
    operation: "add",
    perLevel,
    confidence: "partial",
    sourceRefs: [sourceRef],
  }];
}

function expandDice(row: DiceCompactRow): DiceDefinitionV3 {
  const [
    id, numericId, family, nameKey, descriptionKey,
    attack, attackInterval, range, bossMultiplier,
    levelAttack, levelRange, levelCoolTime,
    battleAttack, battleRange, battleAttackInterval, battleBossMultiplier,
    mechanicRuleId, projectileAbilityId, defenderSkillKind, targetingType, attackType, coolTime,
  ] = row;
  const sourceBase = `ipa-table:DefenderTable:${id}`;
  const extra: Record<string, number | string | boolean> = {};
  if (projectileAbilityId) extra.ProjectileAbilityId = projectileAbilityId;
  if (defenderSkillKind) extra.DefenderSkillKind = defenderSkillKind;
  if (targetingType) extra.TargetingType = targetingType;
  if (attackType) extra.DefenderAttackType = attackType;
  if (coolTime !== null) extra.CoolTime = coolTime;

  return {
    id,
    ...(numericId !== null ? { numericId } : {}),
    ...(family ? { family } : {}),
    ...(nameKey ? { nameKey } : {}),
    ...(descriptionKey ? { descriptionKey } : {}),
    baseStats: {
      ...(attack !== null ? { attack } : {}),
      ...(attackInterval !== null ? { attackInterval } : {}),
      ...(range !== null ? { range } : {}),
      ...(bossMultiplier !== null ? { bossMultiplier } : {}),
      extra,
    },
    levelGrowth: [
      ...growthRule("attack", levelAttack, `${sourceBase}:Attack_LvAdd`),
      ...growthRule("range", levelRange, `${sourceBase}:Range_LvAdd`),
      ...growthRule("coolTime", levelCoolTime, `${sourceBase}:CoolTime_LvAdd`),
    ],
    battleUpgradeGrowth: [
      ...growthRule("attack", battleAttack, `${sourceBase}:Attack_UpAdd`),
      ...growthRule("range", battleRange, `${sourceBase}:Range_UpAdd`),
      ...growthRule("attackInterval", battleAttackInterval, `${sourceBase}:AttackInterval_UpAdd`),
      ...growthRule("bossMultiplier", battleBossMultiplier, `${sourceBase}:BossAttackPer_UpAdd`),
    ],
    ...(mechanicRuleId ? { mechanicRuleId } : {}),
    sourceRefs: [sourceBase],
  };
}

function expandTree(row: TreeCompactRow): DiceTreeNodeV3 {
  const [id, family, kind, x, y, compactPrerequisites, targetId, maxRank, costs, linkedRef, nameKey, descriptionKey] = row;
  return {
    id,
    family,
    kind,
    position: { x, y },
    prerequisites: compactPrerequisites.map((entry) => (
      typeof entry === "string"
        ? { nodeId: entry, minRank: 1 }
        : { nodeId: entry[0], minRank: entry[1] }
    )),
    ...(targetId ? { targetId } : {}),
    maxRank,
    costsByRank: costs.map(([gold, stone, solarCore = 0]) => ({ gold, stone, ...(solarCore > 0 ? { solarCore } : {}) })),
    ...(linkedRef ? { passiveOrRuneRef: linkedRef } : {}),
    ...(nameKey ? { nameKey } : {}),
    ...(descriptionKey ? { descriptionKey } : {}),
    sourceRefs: [`ipa-table:DiceTreeNodeTable:${id}`],
  };
}

function expandPassive(row: PassiveCompactRow): PassiveDefinitionV3 {
  const [id, numericId, scope, maxRank, baseValue, valuePerRank, valueType, nameKey, descriptionKey] = row;
  return {
    id,
    ...(numericId !== null ? { numericId } : {}),
    scope,
    maxRank,
    ...(baseValue !== null ? { baseValue } : {}),
    ...(valuePerRank !== null ? { valuePerRank } : {}),
    ...(valueType ? { valueType } : {}),
    ...(nameKey ? { nameKey } : {}),
    ...(descriptionKey ? { descriptionKey } : {}),
    confidence: "verified",
    sourceRefs: [`ipa-table:PlayerPassiveTable:${id}`],
  };
}

function expandRune(row: RuneCompactRow): RuneDefinitionV3 {
  const [id, kind, grade, maxRank, targetDiceId, values, nameKey, descriptionKey] = row;
  return {
    id,
    ...(kind ? { kind } : {}),
    ...(grade ? { grade } : {}),
    ...(maxRank !== null ? { maxRank } : {}),
    ...(targetDiceId ? { targetDiceId } : {}),
    values,
    ...(nameKey ? { nameKey } : {}),
    ...(descriptionKey ? { descriptionKey } : {}),
    confidence: "verified",
    sourceRefs: [`ipa-table:RuneTable:${id}`],
  };
}

function mergeLocalization(parts: LocalizationCompact[]) {
  const ko: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const part of parts) {
    for (const [key, [koText, enText]] of Object.entries(part)) {
      ko[key] = koText;
      en[key] = enText;
    }
  }
  return { ko, en };
}

export function loadCanonicalGameData(data: CanonicalGameData): CanonicalGameData {
  return validateCanonicalGameData(data);
}

export const gameDataV3 = loadCanonicalGameData({
  manifest: manifestJson as GameManifest,
  dice: (diceCompact as unknown as DiceCompactRow[]).map(expandDice),
  tree: ([...tree01, ...tree02, ...tree03, ...tree04, ...tree05, ...tree06] as unknown as TreeCompactRow[]).map(expandTree),
  passives: ([...passives01, ...passives02] as unknown as PassiveCompactRow[]).map(expandPassive),
  runes: ([...runes01, ...runes02, ...runes03, ...runes04] as unknown as RuneCompactRow[]).map(expandRune),
  enemies: enemiesJson as unknown as EnemyDefinitionV3[],
  localization: mergeLocalization(([
    localization01,
    localization02,
    localization03,
    localization04,
    localization05,
  ] as unknown) as LocalizationCompact[]),
});

export const mechanicEvidenceV3 = mechanicEvidenceJson as unknown as MechanicEvidenceV3[];
export const versusWavesV3 = wavesJson as unknown as Array<Record<string, string>>;

export function localizeGameKey(key: string | undefined, locale: "ko" | "en", fallback = "") {
  if (!key) return fallback;
  return gameDataV3.localization[locale][key] ?? gameDataV3.localization.ko[key] ?? fallback;
}

export function confidenceOfMechanic(key: string): CalculationConfidence {
  return mechanicEvidenceV3.find((entry) => entry.key === key)?.confidence ?? "partial";
}
