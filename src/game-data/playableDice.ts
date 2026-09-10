import type { CanonicalGameData } from "./types";

/**
 * Compact allow-list consumers such as the Worker cannot load the full tree.
 * Keep this inverse set covered by the tree-equivalence unit test below.
 */
export const NON_PLAYABLE_DICE_IDS = new Set([
  "energy",
  "joker",
  "stone",
  "spgemstone",
  "altar",
  "hammer",
  "germ",
  "burn",
  "slow",
  "royal",
  "ax",
  "flow",
  "speedgun",
  "bomb",
]);

/**
 * DefenderTable also contains summoned objects and temporary battle entities
 * that reuse the dice record shape. A real deck-selectable die has a matching
 * Dice Tree node. The public 1.1.0 cross-check contains the same 42 node IDs.
 */
export function playableDiceV3(data: Pick<CanonicalGameData, "dice" | "tree">) {
  const playableIds = new Set(
    data.tree
      .filter((node) => node.kind === "dice")
      .map((node) => node.targetId)
      .filter((id): id is string => Boolean(id)),
  );
  // Small synthetic datasets used by isolated tools may not include a tree.
  // The production dataset always has dice nodes, so its strict 42-item filter
  // remains authoritative while standalone calculators stay reusable.
  if (playableIds.size === 0) return data.dice;
  return data.dice.filter((dice) => playableIds.has(dice.id));
}
