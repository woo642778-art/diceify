import type { PlannerStateV3 } from "../planner-v3/types";

export interface DecodeV3Options {
  validNodeIds: ReadonlySet<string>;
  maxRanks: ReadonlyMap<string, number>;
  validDiceIds: ReadonlySet<string>;
}

export type DecodeV3Result =
  | { ok: true; state: PlannerStateV3; warnings: string[] }
  | { ok: false; error: string };

function sortedNumberRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

function sortedConditionRecord(
  input: Record<string, number | boolean | string>,
): Record<string, number | boolean | string> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

function canonicalState(state: PlannerStateV3): PlannerStateV3 {
  return {
    schemaVersion: 3,
    dataVersion: state.dataVersion,
    ownedRanks: sortedNumberRecord(state.ownedRanks),
    simulatedRanks: sortedNumberRecord(state.simulatedRanks),
    inventory: {
      gold: state.inventory.gold,
      stone: state.inventory.stone,
      ...(state.inventory.solarCore === undefined ? {} : { solarCore: state.inventory.solarCore }),
    },
    scenario: {
      diceId: state.scenario.diceId,
      diceProgressionLevel: state.scenario.diceProgressionLevel,
      battleUpgradeLevel: state.scenario.battleUpgradeLevel,
      conditionValues: sortedConditionRecord(state.scenario.conditionValues),
      enemyPresetId: state.scenario.enemyPresetId,
      ...(state.scenario.enemyHpOverride === undefined
        ? {}
        : { enemyHpOverride: state.scenario.enemyHpOverride }),
      durationSeconds: state.scenario.durationSeconds,
    },
  };
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): string {
  let encoded = value.replaceAll("-", "+").replaceAll("_", "/");
  while (encoded.length % 4) encoded += "=";
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeV3(state: PlannerStateV3): string {
  return `v3.${encodeBase64Url(JSON.stringify(canonicalState(state)))}`;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validInventory(value: unknown): value is { gold: number; stone: number; solarCore?: number } {
  const candidate = object(value);
  return Boolean(
    candidate
    && Number.isInteger(candidate.gold)
    && Number(candidate.gold) >= 0
    && Number.isInteger(candidate.stone)
    && Number(candidate.stone) >= 0
    && (candidate.solarCore === undefined || (Number.isInteger(candidate.solarCore) && Number(candidate.solarCore) >= 0)),
  );
}

function decodeRanks(
  value: unknown,
  options: DecodeV3Options,
  warnings: string[],
  label: "owned" | "simulated",
): Record<string, number> | null {
  const source = object(value);
  if (!source) return null;
  const output: Record<string, number> = {};
  for (const [nodeId, rawRank] of Object.entries(source).sort(([a], [b]) => a.localeCompare(b))) {
    if (!options.validNodeIds.has(nodeId)) {
      warnings.push(`unknown-${label}-node:${nodeId}`);
      continue;
    }
    if (!Number.isInteger(rawRank) || Number(rawRank) < 0) return null;
    const maxRank = options.maxRanks.get(nodeId);
    if (maxRank === undefined) return null;
    const rank = Math.min(Number(rawRank), maxRank);
    if (rank > 0) output[nodeId] = rank;
  }
  return output;
}

function decodeConditions(value: unknown): Record<string, number | boolean | string> | null {
  const source = object(value);
  if (!source) return null;
  const output: Record<string, number | boolean | string> = {};
  for (const [key, condition] of Object.entries(source)) {
    if (
      typeof condition !== "string"
      && typeof condition !== "boolean"
      && !(typeof condition === "number" && Number.isFinite(condition))
    ) return null;
    output[key] = condition;
  }
  return output;
}

export function decodeV3(value: string, options: DecodeV3Options): DecodeV3Result {
  try {
    if (!value.startsWith("v3.")) return { ok: false, error: "unsupported-share-version" };
    const raw = object(JSON.parse(decodeBase64Url(value.slice(3))));
    if (!raw || raw.schemaVersion !== 3 || typeof raw.dataVersion !== "string") {
      return { ok: false, error: "invalid-v3-state" };
    }

    const warnings: string[] = [];
    const ownedRanks = decodeRanks(raw.ownedRanks, options, warnings, "owned");
    const decodedSimulatedRanks = decodeRanks(raw.simulatedRanks, options, warnings, "simulated");
    if (!ownedRanks || !decodedSimulatedRanks || !validInventory(raw.inventory)) {
      return { ok: false, error: "invalid-v3-state" };
    }

    const simulatedRanks: Record<string, number> = {};
    for (const [nodeId, target] of Object.entries(decodedSimulatedRanks)) {
      const owned = ownedRanks[nodeId] ?? 0;
      if (target > owned) simulatedRanks[nodeId] = target;
    }

    const scenario = object(raw.scenario);
    if (!scenario || typeof scenario.diceId !== "string" || !options.validDiceIds.has(scenario.diceId)) {
      return { ok: false, error: "invalid-v3-dice" };
    }
    if (
      !Number.isInteger(scenario.diceProgressionLevel)
      || Number(scenario.diceProgressionLevel) < 1
      || !Number.isInteger(scenario.battleUpgradeLevel)
      || Number(scenario.battleUpgradeLevel) < 1
      || typeof scenario.enemyPresetId !== "string"
      || !scenario.enemyPresetId
      || typeof scenario.durationSeconds !== "number"
      || !Number.isFinite(scenario.durationSeconds)
      || scenario.durationSeconds <= 0
    ) return { ok: false, error: "invalid-v3-scenario" };

    const conditionValues = decodeConditions(scenario.conditionValues);
    if (!conditionValues) return { ok: false, error: "invalid-v3-conditions" };

    const enemyHpOverride = scenario.enemyHpOverride;
    if (
      enemyHpOverride !== undefined
      && (typeof enemyHpOverride !== "number" || !Number.isFinite(enemyHpOverride) || enemyHpOverride <= 0)
    ) return { ok: false, error: "invalid-v3-enemy-hp" };

    return {
      ok: true,
      state: canonicalState({
        schemaVersion: 3,
        dataVersion: raw.dataVersion,
        ownedRanks,
        simulatedRanks,
        inventory: raw.inventory,
        scenario: {
          diceId: scenario.diceId,
          diceProgressionLevel: Number(scenario.diceProgressionLevel),
          battleUpgradeLevel: Number(scenario.battleUpgradeLevel),
          conditionValues,
          enemyPresetId: scenario.enemyPresetId,
          ...(enemyHpOverride === undefined ? {} : { enemyHpOverride }),
          durationSeconds: scenario.durationSeconds,
        },
      }),
      warnings,
    };
  } catch {
    return { ok: false, error: "malformed-v3-share" };
  }
}

export function decodeV3FromHash(hash: string, options: DecodeV3Options): DecodeV3Result | null {
  if (!hash.startsWith("#b=")) return null;
  return decodeV3(decodeURIComponent(hash.slice(3)), options);
}
