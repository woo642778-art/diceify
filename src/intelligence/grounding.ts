import { z } from "zod";
import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceCommandV64, IntelligenceResultV63 } from "./types";

export const IntelligenceIntentSchemaV63 = z.object({
  tool: z.enum(["calculate_route", "compare_routes", "find_breakpoint", "explain_result"]),
  goal: z.enum(["basic-dps", "resource-efficiency", "target-dice", "pvp", "coop"]).optional(),
  maxPurchases: z.number().int().min(1).max(8).optional(),
});

export type IntelligenceIntentV63 = z.infer<typeof IntelligenceIntentSchemaV63>;

const RESOURCE_ALIASES = {
  gold: ["골드", "gold"],
  stone: ["코어", "다이스코어", "dicecore", "core"],
  solarCore: ["태양 코어", "태양코어", "솔라 코어", "솔라코어", "solarcore", "solar"],
} as const;

function compact(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s·_\-]/g, "");
}

export function parseKoreanNumberV64(raw: string): number | null {
  const value = raw.trim().replaceAll(",", "");
  const match = value.match(/^(\d+(?:\.\d+)?)(만|천|k|m)?$/i);
  if (!match) return null;
  const multiplier = match[2]?.toLocaleLowerCase("ko-KR") === "만" ? 10_000
    : match[2]?.toLocaleLowerCase("ko-KR") === "천" || match[2]?.toLocaleLowerCase("ko-KR") === "k" ? 1_000
      : match[2]?.toLocaleLowerCase("ko-KR") === "m" ? 1_000_000 : 1;
  const parsed = Number(match[1]) * multiplier;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function localizedDiceAliases(data: CanonicalGameData) {
  return data.dice.flatMap((dice) => {
    const ko = dice.nameKey ? data.localization.ko[dice.nameKey] : undefined;
    const en = dice.nameKey ? data.localization.en[dice.nameKey] : undefined;
    return [dice.id, ko, en]
      .filter((value): value is string => Boolean(value))
      .map((alias) => ({ id: dice.id, alias, normalized: compact(alias.replace(/주사위|dice/gi, "")) }));
  });
}

function editDistanceAtMostOne(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let first = 0;
  let second = 0;
  let edits = 0;
  while (first < left.length && second < right.length) {
    if (left[first] === right[second]) { first += 1; second += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) first += 1;
    else if (right.length > left.length) second += 1;
    else { first += 1; second += 1; }
  }
  return edits + (left.length - first) + (right.length - second) <= 1;
}

export function parseAnalysisCommandV64(question: string, data: CanonicalGameData): IntelligenceCommandV64 {
  const normalized = question.toLocaleLowerCase("ko-KR");
  const dense = compact(normalized);
  const matched: string[] = [];
  const resourceDelta: IntelligenceCommandV64["resourceDelta"] = {};
  const resourceOverride: IntelligenceCommandV64["resourceOverride"] = {};
  for (const [kind, aliases] of Object.entries(RESOURCE_ALIASES) as Array<[keyof typeof RESOURCE_ALIASES, readonly string[]]>) {
    if (kind === "stone" && /(?:태양|솔라)\s*코어|solar\s*core/i.test(normalized)) continue;
    const alias = aliases.find((entry) => dense.includes(compact(entry)));
    if (!alias) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const amountMatch = normalized.match(new RegExp(`${escaped}\\s*(?:를|을|가|이)?\\s*(?:\\+|plus|더)?\\s*([\\d,.]+\\s*(?:만|천|k|m)?)`, "i"))
      ?? normalized.match(new RegExp(`([\\d,.]+\\s*(?:만|천|k|m)?)\\s*(?:개의?|만큼의?)?\\s*${escaped}`, "i"));
    const amount = amountMatch ? parseKoreanNumberV64(amountMatch[1].replace(/\s/g, "")) : null;
    if (amount === null) continue;
    if (/\+|더|추가|늘|있으면|가정/.test(normalized)) resourceDelta[kind] = amount;
    else resourceOverride[kind] = amount;
    matched.push(`resource:${kind}`);
  }

  const purchaseMatch = normalized.match(/(?:다음|next)\s*([1-8])\s*(?:개|회|단계)?|([1-8])\s*(?:개|회|단계)\s*(?:만|까지)?/i);
  const maxPurchases = purchaseMatch ? Number(purchaseMatch[1] ?? purchaseMatch[2]) : undefined;
  if (maxPurchases) matched.push("horizon");

  const goal = /효율|가성비|최대\s*효율|efficien/.test(normalized) ? "resource-efficiency"
    : /협동|coop/.test(normalized) ? "coop"
      : /대전|pvp/.test(normalized) ? "pvp"
        : /해금|목표\s*주사위|target/.test(normalized) ? "target-dice"
          : /dps|공격|딜/.test(normalized) ? "basic-dps" : undefined;
  if (goal) matched.push(`goal:${goal}`);

  const fuzzyStopWords = new Set(["기준", "다시", "계산", "경로", "주사위", "목표", "다음", "비교", "협동", "대전", "효율", "덱"]);
  const queryTokens = normalized.split(/[^0-9a-z가-힣]+/i).map(compact).filter((token) => token.length >= 2 && !fuzzyStopWords.has(token));
  const diceAliases = localizedDiceAliases(data).filter((candidate) => candidate.normalized.length >= 2);
  const exactDiceMatches = diceAliases.filter((candidate) => dense.includes(candidate.normalized));
  const exactDice = (exactDiceMatches.length ? exactDiceMatches : diceAliases.filter((candidate) => queryTokens.some((token) => editDistanceAtMostOne(token, candidate.normalized))))
    .sort((left, right) => right.normalized.length - left.normalized.length)[0];
  const targetDiceId = exactDice?.id;
  if (targetDiceId) matched.push(`dice:${targetDiceId}`);
  const nodeMatch = normalized.match(/(?:node|노드)?\s*[:#-]?\s*(\d{4})/i);
  const targetNodeId = nodeMatch && data.tree.some((node) => node.id === nodeMatch[1]) ? nodeMatch[1] : undefined;
  if (targetNodeId) matched.push(`node:${targetNodeId}`);

  const tool = /왜|근거|설명|why/.test(normalized) ? "explain_result"
    : /비교|대신|오른쪽|저거|compare/.test(normalized) ? "compare_routes"
      : /언제|모아|부족|저축|breakpoint|save/.test(normalized) ? "find_breakpoint"
        : "calculate_route";
  if (tool !== "calculate_route") matched.push(`tool:${tool}`);
  const ambiguousReference = /이거|저거|얘|오른쪽|왼쪽|그럼|왜\s*[?？]?$/.test(normalized);
  return {
    tool,
    ...(goal ? { goal } : {}),
    ...(maxPurchases ? { maxPurchases } : {}),
    ...(targetDiceId ? { targetDiceId } : {}),
    ...(targetNodeId ? { targetNodeId } : {}),
    ...(Object.keys(resourceDelta).length ? { resourceDelta } : {}),
    ...(Object.keys(resourceOverride).length ? { resourceOverride } : {}),
    confidence: matched.length > 0 && !ambiguousReference ? "high" : "ambiguous",
    matched,
  };
}

export function parseDeterministicIntentV63(question: string): IntelligenceIntentV63 {
  const normalized = question.toLocaleLowerCase("ko-KR");
  const tool = /비교|compare/.test(normalized)
    ? "compare_routes"
    : /언제|모아|부족|breakpoint|save/.test(normalized)
      ? "find_breakpoint"
      : /왜|근거|설명|why/.test(normalized)
        ? "explain_result"
        : "calculate_route";
  const goal = /효율|가성비|efficien/.test(normalized)
    ? "resource-efficiency"
    : /협동|coop/.test(normalized)
      ? "coop"
      : /대전|pvp/.test(normalized)
        ? "pvp"
        : /해금|목표 주사위|target/.test(normalized)
          ? "target-dice"
          : "basic-dps";
  const count = normalized.match(/(?:다음|next)\s*(\d)|([1-8])\s*(?:개|회|단계|steps?)/)?.slice(1).find(Boolean);
  return { tool, goal, ...(count ? { maxPurchases: Number(count) } : {}) };
}

function allowedNumbers(result: IntelligenceResultV63) {
  const values = new Set<string>(["0", "1", String(result.search.horizon), String(result.search.visitedStates)]);
  const add = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    values.add(String(value));
    values.add(value.toFixed(1));
    values.add(value.toFixed(2));
    values.add(Math.round(value).toLocaleString("en-US"));
    values.add(Math.round(value).toLocaleString("ko-KR"));
  };
  for (const route of [result.primary, ...result.alternatives]) {
    if (!route) continue;
    add(route.cost.gold); add(route.cost.stone); add(route.cost.solarCore ?? 0); add(route.score);
    for (const metric of route.metrics) {
      add(metric.before); add(metric.after); add(metric.absoluteGain); add(metric.percentGain);
    }
  }
  add(result.breakpoint.shortage.gold);
  add(result.breakpoint.shortage.stone);
  add(result.breakpoint.shortage.solarCore ?? 0);
  return values;
}

export function validateGroundedExplanationV63(
  explanation: string,
  result: IntelligenceResultV63,
  data: CanonicalGameData,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const validNodeIds = new Set(data.tree.map((node) => node.id));
  const allowed = allowedNumbers(result);
  const citations = [...explanation.matchAll(/\[node:([^\]]+)\]/g)].map((match) => match[1]);
  if (citations.some((id) => !validNodeIds.has(id))) reasons.push("unknown-node-citation");
  const withoutCitations = explanation.replace(/\[node:[^\]]+\]/g, "");
  const numbers = withoutCitations.match(/-?\d[\d,.]*(?:\.\d+)?/g) ?? [];
  if (numbers.some((value) => !allowed.has(value.replaceAll(",", "")) && !allowed.has(value))) reasons.push("ungrounded-number");
  return { ok: reasons.length === 0, reasons };
}

export function deterministicExplanationV63(result: IntelligenceResultV63, locale: "ko" | "en") {
  const route = result.primary;
  if (!route) return result.search.visitedStates > 1
    ? locale === "ko"
      ? "실행 가능한 구매는 있지만 현재 데이터로 검증된 성능 이득은 없습니다."
      : "Purchases are feasible, but the current data verifies no performance gain."
    : locale === "ko"
      ? "현재 재화와 검증 범위에서는 실행 가능한 추천 경로가 없습니다."
      : "No recommendation is feasible with the current resources and verified scope.";
  const nodeRefs = route.steps.map((step) => `[node:${step.nodeId}]`).join(" → ");
  const metric = route.metrics.find((entry) => entry.percentGain !== null && entry.absoluteGain > 0);
  if (locale === "ko") {
    const performance = metric
      ? ` 검증된 ${metric.id === "practical-dps" ? "실전" : "기본 공격"} DPS 변화는 ${metric.percentGain!.toFixed(2)}%입니다.`
      : " 성능 증가율은 현재 공식으로 확정할 수 없어 비용과 선행 조건만 확정했습니다.";
    return `${nodeRefs} 순서가 현재 목표의 우선 경로입니다. 총비용은 ${route.cost.gold.toLocaleString("ko-KR")} 골드, ${route.cost.stone.toLocaleString("ko-KR")} 코어, ${(route.cost.solarCore ?? 0).toLocaleString("ko-KR")} 태양 코어입니다.${performance}`;
  }
  const performance = metric
    ? ` The verified ${metric.id === "practical-dps" ? "practical" : "basic attack"} DPS change is ${metric.percentGain!.toFixed(2)}%.`
    : " Performance gain is not verified, so only cost and prerequisites are asserted.";
  return `${nodeRefs} is the priority route for the current goal. It costs ${route.cost.gold.toLocaleString("en-US")} Gold, ${route.cost.stone.toLocaleString("en-US")} Core, and ${(route.cost.solarCore ?? 0).toLocaleString("en-US")} Solar Core.${performance}`;
}

export function buildGroundedPromptV63(question: string, result: IntelligenceResultV63, locale: "ko" | "en") {
  return [
    "You are the local Diceify explanation layer. The deterministic payload below is authoritative.",
    "Never calculate, change, estimate, or invent numbers. Do not claim live meta or player data.",
    "Use only node citations already present as [node:id]. Keep every numeric value exactly as provided.",
    `Answer language: ${locale === "ko" ? "Korean" : "English"}.`,
    `Question: ${question}`,
    `Authoritative payload: ${JSON.stringify({ dataVersion: result.dataVersion, goal: result.goal, primary: result.primary, alternatives: result.alternatives, breakpoint: result.breakpoint, search: result.search, limitations: result.limitations })}`,
  ].join("\n");
}
