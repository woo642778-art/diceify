import { describe, expect, it } from "vitest";
import { BUILT_IN_META_SNAPSHOTS_V47, metaUsageTimelineV47, parseMetaSnapshotV47 } from "./metaSnapshots";

describe("meta time machine", () => {
  it("preserves the built-in ranking snapshot and computes usage", () => {
    expect(BUILT_IN_META_SNAPSHOTS_V47[0].clientVersion).toBe("1.0.1");
    const timeline = metaUsageTimelineV47(BUILT_IN_META_SNAPSHOTS_V47, "adjust");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].share).toBe(1);
  });

  it("validates imported snapshots instead of replacing history", () => {
    const snapshot = parseMetaSnapshotV47(JSON.stringify({ date: "2026-08-24", decks: [{ rank: 1, role: "dealer", diceIds: ["a", "b", "c", "d", "e"] }] }));
    expect(snapshot.date).toBe("2026-08-24");
    expect(snapshot.source).toBe("imported-json");
  });
});
