import { z } from "zod";
import snapshotJson from "./snapshot.json";
import type { LiveGameStatusV62 } from "./types";

export const LIVE_DATA_ENDPOINTS_V62 = {
  apple: "https://itunes.apple.com/lookup?id=6748432502&country=kr",
  changelog: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/changelog.json",
  dice: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/dice-stats.json",
  nodes: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/nodes.json",
  bosses: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/boss.json",
  tactics: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/tactics.json",
  rift: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/rift-shop.json",
} as const;

const liveGameStatusSchema = z.object({
  schemaVersion: z.literal(1),
  checkedAt: z.string().datetime(),
  officialStore: z.object({
    provider: z.literal("Apple App Store"),
    version: z.string().min(1).max(32),
    releasedAt: z.string().datetime(),
    releaseNotes: z.array(z.string().min(1).max(500)).max(12),
    averageRating: z.number().min(0).max(5).nullable(),
    ratingCount: z.number().int().nonnegative().nullable(),
    url: z.string().url().regex(/^https:\/\/apps\.apple\.com\//),
  }),
  publicCrossCheck: z.object({
    provider: z.literal("rd2-wiki"),
    repository: z.string().url(),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    committedAt: z.string().datetime(),
    commitUrl: z.string().url().regex(/^https:\/\/github\.com\/NatsuYukiowob\/rd2-wiki\/commit\//),
    latestChangeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gameVersion: z.string().min(1).max(32),
    counts: z.object({
      dice: z.number().int().positive().max(500),
      treeNodes: z.number().int().positive().max(2_000),
      bosses: z.number().int().nonnegative().max(500),
      tactics: z.number().int().nonnegative().max(2_000),
      riftEffects: z.number().int().nonnegative().max(2_000),
    }),
  }),
});

const appleSchema = z.object({
  resultCount: z.number().int().positive(),
  results: z.array(z.object({
    version: z.string().min(1),
    currentVersionReleaseDate: z.string().datetime(),
    releaseNotes: z.string().optional(),
    averageUserRatingForCurrentVersion: z.number().min(0).max(5).optional(),
    userRatingCountForCurrentVersion: z.number().int().nonnegative().optional(),
    trackViewUrl: z.string().url().regex(/^https:\/\/apps\.apple\.com\//),
  })).min(1),
});

const changelogSchema = z.object({
  entries: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data: z.object({ gameVersion: z.string().min(1) }).optional(),
  })).min(1),
});

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const MAX_LIVE_SOURCE_BYTES = 5_000_000;

async function fetchJson(fetcher: Fetcher, url: string, signal?: AbortSignal) {
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Live data source returned HTTP ${response.status}`);
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_LIVE_SOURCE_BYTES) {
    throw new Error("Live data source response is too large");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_LIVE_SOURCE_BYTES) {
    throw new Error("Live data source response is too large");
  }
  return JSON.parse(body) as unknown;
}

function recordCount(value: unknown, label: string) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  throw new Error(`${label} did not return a record collection`);
}

function releaseNoteLines(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function parseLiveGameStatusV62(value: unknown): LiveGameStatusV62 {
  return liveGameStatusSchema.parse(value);
}

export const LIVE_GAME_STATUS_SNAPSHOT_V62 = parseLiveGameStatusV62(snapshotJson);

export async function fetchLiveGameStatusV62(
  fetcher: Fetcher = fetch,
  now: () => Date = () => new Date(),
  signal?: AbortSignal,
  baseline: LiveGameStatusV62 = LIVE_GAME_STATUS_SNAPSHOT_V62,
): Promise<LiveGameStatusV62> {
  const [appleRaw, changelogRaw, diceRaw, nodesRaw, bossesRaw, tacticsRaw, riftRaw] = await Promise.all([
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.apple, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.changelog, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.dice, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.nodes, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.bosses, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.tactics, signal),
    fetchJson(fetcher, LIVE_DATA_ENDPOINTS_V62.rift, signal),
  ]);

  const apple = appleSchema.parse(appleRaw).results[0];
  const changelog = changelogSchema.parse(changelogRaw);
  const latestDataEntry = changelog.entries.find((entry) => entry.data);
  if (!latestDataEntry?.data) throw new Error("Public cross-check has no versioned data entry");

  return parseLiveGameStatusV62({
    schemaVersion: 1,
    checkedAt: now().toISOString(),
    officialStore: {
      provider: "Apple App Store",
      version: apple.version,
      releasedAt: apple.currentVersionReleaseDate,
      releaseNotes: releaseNoteLines(apple.releaseNotes),
      averageRating: apple.averageUserRatingForCurrentVersion ?? null,
      ratingCount: apple.userRatingCountForCurrentVersion ?? null,
      url: apple.trackViewUrl,
    },
    publicCrossCheck: {
      provider: "rd2-wiki",
      repository: "https://github.com/NatsuYukiowob/rd2-wiki",
      commitSha: baseline.publicCrossCheck.commitSha,
      committedAt: baseline.publicCrossCheck.committedAt,
      commitUrl: baseline.publicCrossCheck.commitUrl,
      latestChangeDate: changelog.entries[0].date,
      gameVersion: latestDataEntry.data.gameVersion,
      counts: {
        dice: recordCount(diceRaw, "dice"),
        treeNodes: recordCount(nodesRaw, "nodes"),
        bosses: recordCount(bossesRaw, "bosses"),
        tactics: recordCount(tacticsRaw, "tactics"),
        riftEffects: recordCount(riftRaw, "rift effects"),
      },
    },
  });
}
