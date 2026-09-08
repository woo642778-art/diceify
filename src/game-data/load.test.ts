import { describe, expect, it } from "vitest";
import { gameDataV3, localizeGameKey, mechanicEvidenceV3 } from "./load";

describe("IPA-backed V3 canonical data", () => {
  it("loads every extracted canonical collection", () => {
    expect(gameDataV3.dice).toHaveLength(56);
    expect(gameDataV3.tree).toHaveLength(241);
    expect(gameDataV3.passives).toHaveLength(111);
    expect(gameDataV3.runes).toHaveLength(154);
    expect(gameDataV3.enemies).toHaveLength(28);
  });

  it("loads Solar Dice and its dedicated 1.1.0 currency without conflating Dice Core", () => {
    expect(gameDataV3.dice.find((dice) => dice.id === "solar")?.numericId).toBe(
      56,
    );
    const solar = gameDataV3.tree.find((node) => node.id === "1501");
    expect(solar?.prerequisites).toEqual([
      { nodeId: "1201", minRank: 50 },
      { nodeId: "1301", minRank: 1 },
      { nodeId: "1401", minRank: 1 },
    ]);
    expect(solar?.costsByRank).toEqual([
      { gold: 100000, stone: 0, solarCore: 2000 },
    ]);
  });

  it("pins the Predator client stats without inventing its formula", () => {
    const predator = gameDataV3.dice.find((dice) => dice.id === "predator");
    expect(predator?.numericId).toBe(50);
    expect(predator?.family).toBe("chaos");
    expect(predator?.baseStats.attack).toBe(1000);
    expect(predator?.baseStats.attackInterval).toBe(2.7);
    expect(predator?.baseStats.range).toBe(1.2);
    expect(
      predator?.battleUpgradeGrowth.find(
        (rule) => rule.stat === "attackInterval",
      ),
    ).toMatchObject({
      perLevel: -0.08,
      confidence: "partial",
    });
    expect(
      mechanicEvidenceV3.find((entry) => entry.key === "predator-mechanics")
        ?.formula,
    ).toBeNull();
  });

  it("uses exact client Gold and Dice Core rank costs", () => {
    const unlock = gameDataV3.tree.find((node) => node.id === "5007");
    const predatorAmplification = gameDataV3.tree.find(
      (node) => node.id === "5207",
    );
    const chainPredation = gameDataV3.tree.find((node) => node.id === "5307");
    const weakPredation = gameDataV3.tree.find((node) => node.id === "5407");

    expect(unlock?.costsByRank).toEqual([{ gold: 0, stone: 8 }]);
    expect(predatorAmplification?.maxRank).toBe(50);
    expect(predatorAmplification?.costsByRank[0]).toEqual({
      gold: 2000,
      stone: 0,
    });
    expect(predatorAmplification?.costsByRank[5]).toEqual({
      gold: 1600,
      stone: 1,
    });
    expect(chainPredation?.costsByRank).toEqual([{ gold: 50000, stone: 10 }]);
    expect(weakPredation?.costsByRank).toEqual([{ gold: 100000, stone: 20 }]);
  });

  it("uses the actual in-game Dice Core localization", () => {
    expect(localizeGameKey("goods_node_stone", "ko")).toBe("다이스 코어");
    expect(localizeGameKey("goods_node_stone", "en")).toBe("Dice Core");
    expect(localizeGameKey("dice_predator_name", "ko")).toBe("포식");
    expect(localizeGameKey("dice_bingo_name", "ko")).toBe("태극");
  });

  it("contains no V2 fake Dice Tree currencies", () => {
    const serialized = JSON.stringify(gameDataV3.tree);
    expect(serialized).not.toContain("blueCard");
    expect(serialized).not.toContain("redCard");
    expect(serialized).not.toContain("prismCube");
  });
});
