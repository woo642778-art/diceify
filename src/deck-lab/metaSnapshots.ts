import { CO_OP_RANKING_SNAPSHOT, CO_OP_RANKING_SNAPSHOT_DATE, type CoOpRankedDeck } from "./coOpRankingSnapshot";

export interface MetaSnapshotV47 {
  date: string;
  /** Patch observed by the capture. Omitted only for legacy user imports. */
  clientVersion?: string;
  mode: "coop";
  decks: readonly CoOpRankedDeck[];
  source: "user-captures" | "imported-json";
}

export interface MetaUsagePointV47 { date: string; decks: number; share: number; averageRank: number | null }

export const BUILT_IN_META_SNAPSHOTS_V47: readonly MetaSnapshotV47[] = [{
  date: CO_OP_RANKING_SNAPSHOT_DATE,
  clientVersion: "1.0.1",
  mode: "coop",
  decks: CO_OP_RANKING_SNAPSHOT,
  source: "user-captures",
}];

export function metaUsageTimelineV47(snapshots: readonly MetaSnapshotV47[], diceId: string): MetaUsagePointV47[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).map((snapshot) => {
    const ranks = snapshot.decks.filter((deck) => deck.diceIds.includes(diceId)).map((deck) => deck.rank);
    return { date: snapshot.date, decks: ranks.length, share: snapshot.decks.length ? ranks.length / snapshot.decks.length : 0, averageRank: ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null };
  });
}

export function parseMetaSnapshotV47(value: string): MetaSnapshotV47 {
  const parsed = JSON.parse(value) as Partial<MetaSnapshotV47>;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date ?? "") || !Array.isArray(parsed.decks)) throw new Error("Snapshot requires date and decks");
  const ranks = new Set<number>();
  for (const deck of parsed.decks) {
    if (!Number.isInteger(deck.rank) || ranks.has(deck.rank) || !Array.isArray(deck.diceIds) || deck.diceIds.length !== 5) throw new Error("Each deck needs a unique rank and five dice");
    ranks.add(deck.rank);
  }
  return { date: parsed.date!, ...(typeof parsed.clientVersion === "string" && parsed.clientVersion ? { clientVersion: parsed.clientVersion } : {}), mode: "coop", decks: parsed.decks, source: "imported-json" };
}
