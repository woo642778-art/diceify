import { describe, expect, it } from "vitest";
import { fetchLiveGameStatusV62, parseLiveGameStatusV62 } from "./status";

const responses = [
  { resultCount: 1, results: [{ version: "1.2.0", currentVersionReleaseDate: "2026-09-10T00:00:00.000Z", releaseNotes: "- 새 주사위\n- 밸런스 조정", averageUserRatingForCurrentVersion: 4.4, userRatingCountForCurrentVersion: 1500, trackViewUrl: "https://apps.apple.com/kr/app/id6748432502" }] },
  { entries: [{ date: "2026-09-10", data: { gameVersion: "1.2.0" } }] },
  { D000: {}, D001: {} },
  { "1001": {}, "1002": {}, "1003": {} },
  [{ id: 1 }],
  [{ id: 1 }, { id: 2 }],
  [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
];

describe("live game status", () => {
  it("normalizes trusted live endpoints into a bounded status record", async () => {
    let index = 0;
    const fetcher = async () => new Response(JSON.stringify(responses[index++]), { status: 200 });
    const data = await fetchLiveGameStatusV62(fetcher, () => new Date("2026-09-10T02:00:00.000Z"));
    expect(data.officialStore).toMatchObject({ version: "1.2.0", releaseNotes: ["새 주사위", "밸런스 조정"], ratingCount: 1500 });
    expect(data.publicCrossCheck).toMatchObject({ gameVersion: "1.2.0", counts: { dice: 2, treeNodes: 3, bosses: 1, tactics: 2, riftEffects: 4 } });
  });

  it("rejects malformed or unbounded source data", () => {
    expect(() => parseLiveGameStatusV62({ schemaVersion: 1 })).toThrow();
  });

  it("fails closed when a source request fails", async () => {
    const fetcher = async () => new Response("unavailable", { status: 503 });
    await expect(fetchLiveGameStatusV62(fetcher)).rejects.toThrow("HTTP 503");
  });

  it("rejects oversized upstream responses before parsing them", async () => {
    const fetcher = async () => new Response("{}", {
      status: 200,
      headers: { "content-length": "5000001" },
    });
    await expect(fetchLiveGameStatusV62(fetcher)).rejects.toThrow("too large");
  });
});
