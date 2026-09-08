import { playableDiceV3 } from "../game-data/playableDice";
import type { CanonicalGameData } from "../game-data/types";
import type { PlannerStateV3 } from "../planner-v3/types";
import { starterOwnedRanksV3 } from "../planner-v3/starterRanks";
import type { OwnedDiceV48 } from "./digitalTwinV48";
import {
  CO_OP_RANKING_SNAPSHOT,
  CO_OP_RANKING_SNAPSHOT_DATE,
} from "../deck-lab/coOpRankingSnapshot";

export type ImportedAccountSourceV49 =
  "verified-import" | "observed-ranking" | "local-profile";

export interface AccountIdentityV49 {
  nickname: string;
  pid?: string;
  source: ImportedAccountSourceV49;
  importedAt: string;
  publicRank?: number;
}

export interface ObservedAccountV49 {
  nickname: string;
  rank: number;
  score?: number;
  diceIds: string[];
  sourceDate: string;
  completeness: "rank-and-deck-only";
  pid?: never;
}

export interface FullAccountImportV49 {
  identity: AccountIdentityV49;
  planner: PlannerStateV3;
  roster: Record<string, OwnedDiceV48>;
  deckIds: string[];
  goal: "dealer" | "support" | "balanced";
  spendProfile: "free" | "light" | "invested";
}

export type AccountImportParseResultV49 =
  | { ok: true; account: FullAccountImportV49 }
  | { ok: false; error: { ko: string; en: string } };

const OBSERVED: ObservedAccountV49[] = [
  {
    nickname: "睡魔",
    rank: 1,
    score: 1_718_500,
    diceIds: ["summon", "switch", "blessing", "mutation", "adjust"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "睡魔サブ",
    rank: 2,
    score: 1_718_400,
    diceIds: ["adjust", "switch", "lock", "decay", "ice"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "잉누",
    rank: 3,
    score: 1_646_600,
    diceIds: ["summon", "blessing", "switch", "adjust", "slow"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "Sylveon",
    rank: 4,
    score: 1_428_600,
    diceIds: ["summon", "blessing", "mutation", "adjust", "switch"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "あるたち",
    rank: 5,
    score: 1_428_500,
    diceIds: ["ice", "lock", "decay", "resonance", "adjust"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "じゃくそん",
    rank: 6,
    score: 1_360_000,
    diceIds: ["switch", "adjust", "summon", "blessing", "resonance"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "だんぼーる",
    rank: 7,
    score: 1_359_900,
    diceIds: ["decay", "ice", "adjust", "resonance", "lock"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
  {
    nickname: "Asmo",
    rank: 1230,
    score: 806_915,
    diceIds: ["summon", "adjust", "switch", "blessing", "mutation"],
    sourceDate: "2026-08-16",
    completeness: "rank-and-deck-only",
  },
];

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function lookupObservedAccountV49(
  identifier: string,
): ObservedAccountV49 | undefined {
  const query = normalized(identifier);
  if (!query) return undefined;
  const rank = query.match(/^#?(\d+)$/)?.[1];
  const found = OBSERVED.find(
    (entry) =>
      normalized(entry.nickname) === query ||
      (rank && entry.rank === Number(rank)),
  );
  if (!found && rank) {
    const observedDeck = CO_OP_RANKING_SNAPSHOT.find(
      (entry) => entry.rank === Number(rank),
    );
    if (observedDeck)
      return {
        nickname: `#${observedDeck.rank} 관측 계정`,
        rank: observedDeck.rank,
        ...(observedDeck.score ? { score: observedDeck.score } : {}),
        diceIds: [...observedDeck.diceIds],
        sourceDate: CO_OP_RANKING_SNAPSHOT_DATE,
        completeness: "rank-and-deck-only",
      };
  }
  return found ? structuredClone(found) : undefined;
}

export function createAccountSnapshotTemplateV49(
  state: PlannerStateV3,
  deckIds: readonly string[],
  nickname = "내 계정",
) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      nickname,
      inventory: { ...state.inventory },
      ownedRanks: { ...state.ownedRanks },
      diceLevels: Object.fromEntries(
        deckIds
          .slice(0, 5)
          .map((diceId) => [
            diceId,
            diceId === state.scenario.diceId
              ? state.scenario.diceProgressionLevel
              : 1,
          ]),
      ),
      deckIds: [...deckIds.slice(0, 5)],
      goal: "balanced",
      spendProfile: "free",
    },
    null,
    2,
  );
}

function fail(ko: string, en: string): AccountImportParseResultV49 {
  return { ok: false, error: { ko, en } };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function parseFullAccountSnapshotV49(
  raw: string,
  data: CanonicalGameData,
  baseState: PlannerStateV3,
): AccountImportParseResultV49 {
  if (raw.length > 1_000_000)
    return fail(
      "계정 파일이 1MB를 초과합니다.",
      "The account file exceeds 1 MB.",
    );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail("JSON 형식을 읽을 수 없습니다.", "The JSON format is invalid.");
  }
  if (!record(value) || value.schemaVersion !== 1)
    return fail(
      "지원하는 계정 스냅샷 v1이 아닙니다.",
      "This is not a supported account snapshot v1.",
    );
  const nickname =
    typeof value.nickname === "string"
      ? value.nickname.normalize("NFKC").trim()
      : "";
  const pid = typeof value.pid === "string" ? value.pid.trim() : undefined;
  if (
    !nickname ||
    nickname.length > 32 ||
    (pid !== undefined && (!pid || pid.length > 64))
  )
    return fail(
      "닉네임 또는 PID 형식이 올바르지 않습니다.",
      "The nickname or PID format is invalid.",
    );
  if (
    !record(value.inventory) ||
    !nonNegativeInteger(value.inventory.gold) ||
    !nonNegativeInteger(value.inventory.stone) ||
    (value.inventory.solarCore !== undefined &&
      !nonNegativeInteger(value.inventory.solarCore))
  ) {
    return fail(
      "골드와 코어는 0 이상의 정수여야 합니다.",
      "Gold and Core must be non-negative integers.",
    );
  }
  if (!record(value.ownedRanks))
    return fail("보유 트리 정보가 없습니다.", "Owned tree data is missing.");
  const nodeById = new Map(data.tree.map((node) => [node.id, node]));
  const ownedRanks: Record<string, number> = starterOwnedRanksV3(data.tree);
  for (const [nodeId, rawRank] of Object.entries(value.ownedRanks)) {
    const node = nodeById.get(nodeId);
    if (!node || !nonNegativeInteger(rawRank) || rawRank > node.maxRank)
      return fail(
        `알 수 없거나 범위를 벗어난 트리 노드입니다: ${nodeId}`,
        `Unknown or out-of-range tree node: ${nodeId}`,
      );
    if (rawRank > 0) ownedRanks[nodeId] = rawRank;
  }
  for (const [nodeId, rank] of Object.entries(ownedRanks)) {
    if (rank <= 0) continue;
    const node = nodeById.get(nodeId)!;
    const missing = node.prerequisites.find(
      (prerequisite) =>
        (ownedRanks[prerequisite.nodeId] ?? 0) < prerequisite.minRank,
    );
    if (missing)
      return fail(
        `${nodeId}의 선행 노드 ${missing.nodeId} 랭크 ${missing.minRank}가 필요합니다.`,
        `${nodeId} requires prerequisite ${missing.nodeId} rank ${missing.minRank}.`,
      );
  }
  if (!record(value.diceLevels))
    return fail("주사위 레벨 정보가 없습니다.", "Dice level data is missing.");
  const validDice = new Set(playableDiceV3(data).map((dice) => dice.id));
  const roster: Record<string, OwnedDiceV48> = {};
  for (const [diceId, level] of Object.entries(value.diceLevels)) {
    if (
      !validDice.has(diceId) ||
      !Number.isInteger(level) ||
      Number(level) < 1 ||
      Number(level) > 100
    )
      return fail(
        `알 수 없거나 범위를 벗어난 주사위입니다: ${diceId}`,
        `Unknown or out-of-range dice: ${diceId}`,
      );
    roster[diceId] = { owned: true, level: Number(level) };
  }
  if (
    !Array.isArray(value.deckIds) ||
    value.deckIds.length !== 5 ||
    new Set(value.deckIds).size !== 5 ||
    !value.deckIds.every(
      (diceId) => typeof diceId === "string" && validDice.has(diceId),
    )
  )
    return fail(
      "덱은 서로 다른 플레이 가능 주사위 5개여야 합니다.",
      "The deck must contain five distinct playable dice.",
    );
  const deckIds = value.deckIds as string[];
  if (deckIds.some((diceId) => !roster[diceId]?.owned))
    return fail(
      "덱 주사위는 주사위 레벨 목록에도 포함되어야 합니다.",
      "Every deck die must also appear in diceLevels.",
    );
  const goal = ["dealer", "support", "balanced"].includes(String(value.goal))
    ? (value.goal as FullAccountImportV49["goal"])
    : "balanced";
  const spendProfile = ["free", "light", "invested"].includes(
    String(value.spendProfile),
  )
    ? (value.spendProfile as FullAccountImportV49["spendProfile"])
    : "free";
  const primaryDiceId = deckIds[0];
  const planner: PlannerStateV3 = {
    ...structuredClone(baseState),
    ownedRanks,
    simulatedRanks: {},
    inventory: {
      gold: value.inventory.gold as number,
      stone: value.inventory.stone as number,
      ...(value.inventory.solarCore !== undefined
        ? { solarCore: value.inventory.solarCore as number }
        : {}),
    },
    scenario: {
      ...baseState.scenario,
      diceId: primaryDiceId,
      diceProgressionLevel: roster[primaryDiceId].level,
      conditionValues: {},
    },
  };
  return {
    ok: true,
    account: {
      identity: {
        nickname,
        ...(pid ? { pid } : {}),
        source: "verified-import",
        importedAt: new Date().toISOString(),
      },
      planner,
      roster,
      deckIds: [...deckIds],
      goal,
      spendProfile,
    },
  };
}
