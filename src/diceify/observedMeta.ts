import { CO_OP_RANKING_SNAPSHOT, type CoOpRankedDeck } from "../deck-lab/coOpRankingSnapshot";

export interface ObservedDeckGroup {
  diceIds: string[];
  appearances: number;
  bestRank: number;
  ranks: number[];
  role: CoOpRankedDeck["role"];
}

export function groupObservedDecks(decks: readonly CoOpRankedDeck[] = CO_OP_RANKING_SNAPSHOT): ObservedDeckGroup[] {
  const groups = new Map<string, ObservedDeckGroup>();
  for (const deck of decks) {
    const diceIds = [...deck.diceIds].sort();
    const key = diceIds.join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.appearances += 1;
      existing.bestRank = Math.min(existing.bestRank, deck.rank);
      existing.ranks.push(deck.rank);
    } else {
      groups.set(key, { diceIds, appearances:1, bestRank:deck.rank, ranks:[deck.rank], role:deck.role });
    }
  }
  return [...groups.values()].sort((a,b) => b.appearances-a.appearances || a.bestRank-b.bestRank);
}
