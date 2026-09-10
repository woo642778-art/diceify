import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoints = {
  apple: "https://itunes.apple.com/lookup?id=6748432502&country=kr",
  commit: "https://api.github.com/repos/NatsuYukiowob/rd2-wiki/commits/main",
  changelog: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/changelog.json",
  dice: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/dice-stats.json",
  nodes: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/nodes.json",
  bosses: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/boss.json",
  tactics: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/tactics.json",
  rift: "https://raw.githubusercontent.com/NatsuYukiowob/rd2-wiki/main/data/rift-shop.json",
};
const MAX_SOURCE_BYTES = 5_000_000;
const outputPath = resolve("src/live-data/snapshot.json");

function sleep(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const headers = { Accept: "application/json", "User-Agent": "diceify-live-data-sync" };
      if (url.includes("api.github.com") && process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      const declaredBytes = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SOURCE_BYTES) {
        throw new Error(`${url} returned an oversized response`);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_SOURCE_BYTES) {
        throw new Error(`${url} returned an oversized response`);
      }
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 500);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function collectionCount(value, label, maximum) {
  const count = Array.isArray(value)
    ? value.length
    : value && typeof value === "object"
      ? Object.keys(value).length
      : -1;
  if (!Number.isInteger(count) || count < 0 || count > maximum) {
    throw new Error(`${label} returned an invalid record count`);
  }
  return count;
}

function requiredString(value, label, pattern) {
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function releaseNoteLines(value) {
  return typeof value === "string"
    ? value.split(/\r?\n/).map((line) => line.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean).slice(0, 12)
    : [];
}

const previousSnapshot = JSON.parse(await readFile(outputPath, "utf8"));
let commitSource = "live";
const commitRequest = fetchJson(endpoints.commit).catch((error) => {
  commitSource = "retained";
  console.warn(`GitHub commit verification unavailable; retaining last verified commit (${error.message})`);
  return {
    sha: previousSnapshot?.publicCrossCheck?.commitSha,
    html_url: previousSnapshot?.publicCrossCheck?.commitUrl,
    commit: { committer: { date: previousSnapshot?.publicCrossCheck?.committedAt } },
  };
});

const [appleLookup, commit, changelog, dice, nodes, bosses, tactics, rift] = await Promise.all([
  fetchJson(endpoints.apple),
  commitRequest,
  fetchJson(endpoints.changelog),
  fetchJson(endpoints.dice),
  fetchJson(endpoints.nodes),
  fetchJson(endpoints.bosses),
  fetchJson(endpoints.tactics),
  fetchJson(endpoints.rift),
]);

const app = appleLookup?.results?.[0];
const entries = changelog?.entries;
const latestDataEntry = Array.isArray(entries) ? entries.find((entry) => entry?.data?.gameVersion) : undefined;
if (!app || !latestDataEntry || !entries[0]) throw new Error("A live source omitted required fields");

const snapshot = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  officialStore: {
    provider: "Apple App Store",
    version: requiredString(app.version, "App Store version", /^\d+(?:\.\d+){1,3}$/),
    releasedAt: new Date(requiredString(app.currentVersionReleaseDate, "App Store release date")).toISOString(),
    releaseNotes: releaseNoteLines(app.releaseNotes),
    averageRating: Number.isFinite(app.averageUserRatingForCurrentVersion) ? app.averageUserRatingForCurrentVersion : null,
    ratingCount: Number.isInteger(app.userRatingCountForCurrentVersion) && app.userRatingCountForCurrentVersion >= 0 ? app.userRatingCountForCurrentVersion : null,
    url: requiredString(app.trackViewUrl, "App Store URL", /^https:\/\/apps\.apple\.com\//),
  },
  publicCrossCheck: {
    provider: "rd2-wiki",
    repository: "https://github.com/NatsuYukiowob/rd2-wiki",
    commitSha: requiredString(commit?.sha, "Cross-check commit", /^[0-9a-f]{40}$/),
    committedAt: new Date(requiredString(commit?.commit?.committer?.date, "Cross-check commit date")).toISOString(),
    commitUrl: requiredString(commit?.html_url, "Cross-check commit URL", /^https:\/\/github\.com\/NatsuYukiowob\/rd2-wiki\/commit\//),
    latestChangeDate: requiredString(entries[0].date, "Cross-check change date", /^\d{4}-\d{2}-\d{2}$/),
    gameVersion: requiredString(latestDataEntry.data.gameVersion, "Cross-check game version", /^\d+(?:\.\d+){1,3}$/),
    counts: {
      dice: collectionCount(dice, "dice", 500),
      treeNodes: collectionCount(nodes, "nodes", 2_000),
      bosses: collectionCount(bosses, "bosses", 500),
      tactics: collectionCount(tactics, "tactics", 2_000),
      riftEffects: collectionCount(rift, "rift effects", 2_000),
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Updated ${outputPath}`);
console.log(`Official ${snapshot.officialStore.version}; cross-check ${snapshot.publicCrossCheck.gameVersion} at ${snapshot.publicCrossCheck.commitSha.slice(0, 12)} (${commitSource} commit)`);
