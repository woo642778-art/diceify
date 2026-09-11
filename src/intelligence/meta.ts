import type { CanonicalGameData } from "../game-data/types";
import { BUILT_IN_META_SNAPSHOTS_V47 } from "../deck-lab/metaSnapshots";
import type { MetaEvidenceV63 } from "./types";

export function currentMetaEvidenceV63(data: CanonicalGameData): MetaEvidenceV63 | null {
  const snapshot = [...BUILT_IN_META_SNAPSHOTS_V47].sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!snapshot) return null;
  return {
    snapshotDate: snapshot.date,
    clientVersion: snapshot.clientVersion ?? "unknown",
    source: snapshot.source,
    sampleSize: snapshot.decks.length,
    confidence: "partial",
    limitation: `클라이언트 ${snapshot.clientVersion ?? "미상"}에서 관측된 협동 랭킹 표본입니다. 사용률은 강함이나 승률을 뜻하지 않으며 현재 계산 데이터 ${data.manifest.clientVersion}과 직접 합산하지 않습니다.`,
  };
}
