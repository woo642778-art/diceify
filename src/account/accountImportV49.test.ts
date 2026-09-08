import { describe, expect, it } from "vitest";
import { gameDataV3 } from "../game-data/load";
import type { PlannerStateV3 } from "../planner-v3/types";
import {
  lookupObservedAccountV49,
  parseFullAccountSnapshotV49,
} from "./accountImportV49";
import { starterOwnedRanksV3 } from "../planner-v3/starterRanks";

const baseState: PlannerStateV3 = {
  schemaVersion: 3,
  dataVersion: "test",
  ownedRanks: {},
  simulatedRanks: { "1001": 1 },
  inventory: { gold: 0, stone: 0 },
  scenario: {
    diceId: "predator",
    diceProgressionLevel: 1,
    battleUpgradeLevel: 1,
    conditionValues: {},
    enemyPresetId: "custom",
    durationSeconds: 30,
  },
};

describe("account import V4.9", () => {
  it("looks up a disclosed ranking snapshot without claiming full account access", () => {
    const result = lookupObservedAccountV49("Asmo");
    expect(result).toMatchObject({
      nickname: "Asmo",
      rank: 1230,
      completeness: "rank-and-deck-only",
    });
    expect(result?.diceIds).toHaveLength(5);
    expect(result?.pid).toBeUndefined();
  });

  it("looks up every captured top-105 rank even when the nickname was not transcribed", () => {
    expect(lookupObservedAccountV49("#8")).toMatchObject({
      rank: 8,
      completeness: "rank-and-deck-only",
    });
  });

  it("imports a valid full snapshot into planner, roster and identity state", () => {
    const result = parseFullAccountSnapshotV49(
      JSON.stringify({
        schemaVersion: 1,
        nickname: "모님",
        pid: "RD2-1234",
        inventory: { gold: 300000, stone: 1200, solarCore: 80 },
        ownedRanks: { "1001": 1 },
        diceLevels: {
          predator: 8,
          adjust: 3,
          switch: 2,
          brokengrowth: 4,
          decay: 5,
        },
        deckIds: ["predator", "adjust", "switch", "brokengrowth", "decay"],
        goal: "dealer",
        spendProfile: "light",
      }),
      gameDataV3,
      baseState,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.identity).toMatchObject({
      nickname: "모님",
      pid: "RD2-1234",
      source: "verified-import",
    });
    expect(result.account.planner.ownedRanks).toEqual(
      starterOwnedRanksV3(gameDataV3.tree),
    );
    expect(result.account.planner.simulatedRanks).toEqual({});
    expect(result.account.planner.inventory).toEqual({
      gold: 300000,
      stone: 1200,
      solarCore: 80,
    });
    expect(result.account.roster.predator).toEqual({ owned: true, level: 8 });
  });

  it("rejects impossible prerequisite trees and unknown dice", () => {
    const skipped = parseFullAccountSnapshotV49(
      JSON.stringify({
        schemaVersion: 1,
        nickname: "invalid",
        inventory: { gold: 0, stone: 0 },
        ownedRanks: { "1005": 1 },
        diceLevels: { missing: 2 },
        deckIds: ["predator", "adjust", "switch", "brokengrowth", "decay"],
      }),
      gameDataV3,
      baseState,
    );
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) expect(skipped.error.ko).toMatch(/선행|주사위/);
  });
});
