export function bayesianRate(positive: number, total: number, priorRate = 0.5, priorStrength = 20) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safePositive = Math.min(safeTotal, Math.max(0, Math.floor(positive)));
  return (safePositive + priorRate * priorStrength) / (safeTotal + priorStrength);
}

export function communitySignal(input: { positive: number; total: number; weightedCount: number; minimumSample?: number }) {
  const minimumSample = input.minimumSample ?? 25;
  if (input.total < minimumSample || input.weightedCount < minimumSample * 0.65) {
    return { eligible: false, score: null, confidence: "insufficient" as const };
  }
  const score = bayesianRate(input.positive, input.total);
  const confidence = input.total >= 500 ? "high" : input.total >= 100 ? "medium" : "low";
  return { eligible: true, score, confidence } as const;
}

export function combineRecommendationSignals(input: { canonicalScore: number; communityScore: number | null; communitySample: number }) {
  const canonical = Math.max(0, Math.min(1, input.canonicalScore));
  if (input.communityScore === null) return { score: canonical, canonicalWeight: 1, communityWeight: 0 };
  const communityWeight = Math.min(0.45, Math.log10(Math.max(1, input.communitySample)) / 8);
  return { score: canonical * (1 - communityWeight) + input.communityScore * communityWeight, canonicalWeight: 1 - communityWeight, communityWeight };
}

type AggregateRow = {
  deck_fingerprint: string;
  sample_count: number;
  weighted_count: number;
  window_start: string;
  window_end: string;
};

/**
 * Rebuild one public recommendation segment from consented, active accounts.
 * A user contributes at most once to a deck fingerprint inside the rolling window.
 */
export async function rebuildCommunityDeckSegment(
  db: D1Database,
  input: { submissionId: string; gameDataVersion: string; algorithmVersion: string; now?: Date },
) {
  const submission = await db.prepare(
    "SELECT mode FROM event_submissions WHERE id=? AND review_state='accepted' AND game_data_version=?",
  ).bind(input.submissionId, input.gameDataVersion).first<{ mode: string }>();
  if (!submission || !["pvp", "coop", "crit"].includes(submission.mode)) return { rebuilt: false, segment: null, decks: 0 };

  const segment = submission.mode;
  const timestamp = input.now ?? new Date();
  const windowEnd = timestamp.toISOString();
  const windowStart = new Date(timestamp.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const grouped = await db.prepare(`
    SELECT deck_fingerprint,
      COUNT(*) AS sample_count,
      SUM(contribution_weight) AS weighted_count,
      MIN(first_at) AS window_start,
      MAX(last_at) AS window_end
    FROM (
      SELECT es.user_id, es.deck_fingerprint,
        MIN(es.created_at) AS first_at,
        MAX(es.created_at) AS last_at,
        CASE
          WHEN p.reputation <= -100 THEN 0.5
          WHEN p.reputation >= 100 THEN 1.5
          ELSE 1.0 + p.reputation / 200.0
        END AS contribution_weight
      FROM event_submissions es
      JOIN profiles p ON p.user_id=es.user_id AND p.data_consent=1 AND p.recommendation_opt_out=0
      JOIN users u ON u.id=es.user_id AND u.account_state='active'
      WHERE es.mode=? AND es.review_state='accepted' AND es.game_data_version=? AND es.created_at>=? AND es.created_at<?
      GROUP BY es.user_id, es.deck_fingerprint
    ) consented
    GROUP BY deck_fingerprint
  `).bind(segment, input.gameDataVersion, windowStart, windowEnd).all<AggregateRow>();

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM community_deck_aggregates WHERE segment_key=? AND game_data_version=? AND algorithm_version=?")
      .bind(segment, input.gameDataVersion, input.algorithmVersion),
  ];
  for (const row of grouped.results) {
    statements.push(db.prepare(`INSERT INTO community_deck_aggregates(
      segment_key,deck_fingerprint,sample_count,weighted_count,positive_count,negative_count,
      window_start,window_end,game_data_version,algorithm_version,updated_at
    ) VALUES(?,?,?,?,?,0,?,?,?,?,?)`).bind(
      segment,
      row.deck_fingerprint,
      Number(row.sample_count),
      Number(row.weighted_count),
      Number(row.sample_count),
      row.window_start || windowStart,
      row.window_end || windowEnd,
      input.gameDataVersion,
      input.algorithmVersion,
      windowEnd,
    ));
  }
  await db.batch(statements);
  return { rebuilt: true, segment, decks: grouped.results.length };
}
