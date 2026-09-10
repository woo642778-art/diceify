import { describe, expect, it } from "vitest";
import { gameDataV3 } from "./load";
import { NON_PLAYABLE_DICE_IDS, playableDiceV3 } from "./playableDice";

describe("playableDiceV3", () => {
  it("only exposes the 42 dice represented by playable Dice Tree nodes", () => {
    const ids = playableDiceV3(gameDataV3).map((dice) => dice.id);
    expect(ids).toHaveLength(42);
    expect(ids).toContain("predator");
    expect(ids).toContain("solar");
    expect(ids).not.toContain("joker");
    expect(ids).not.toContain("spgemstone");
    expect(ids).not.toContain("bomb");
    expect(new Set(ids)).toEqual(
      new Set(
        gameDataV3.tree
          .filter((node) => node.kind === "dice")
          .map((node) => node.targetId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    expect(new Set(gameDataV3.dice.map((dice) => dice.id).filter((id) => !ids.includes(id)))).toEqual(NON_PLAYABLE_DICE_IDS);
  });
});
