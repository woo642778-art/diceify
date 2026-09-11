import { z } from "zod";
import { isPlatformConfigured, platformUrl, PlatformApiError } from "../platform/api";
import type { IntelligenceCommandV64, IntelligenceGoalV63 } from "./types";

const resourceSchema = z.object({ gold: z.number().int().min(0), stone: z.number().int().min(0), solarCore: z.number().int().min(0).optional() }).strict();
const hostedIntentSchema = z.object({
  intent: z.enum(["calculate_route", "compare_routes", "find_breakpoint", "explain_result"]),
  goal: z.enum(["basic-dps", "resource-efficiency", "target-dice", "pvp", "coop"]).nullable(),
  targetDiceId: z.string().nullable(),
  targetNodeId: z.string().nullable(),
  comparisonNodeId: z.string().nullable(),
  purchaseLimit: z.number().int().min(1).max(8).nullable(),
  resourceDelta: resourceSchema.partial(),
  resourceOverride: resourceSchema.partial(),
}).strict();

export interface HostedRouteSummaryV64 {
  nodeIds: string[];
  cost: { gold: number; stone: number; solarCore?: number };
  remaining: { gold: number; stone: number; solarCore?: number };
  gainPercent: number | null;
  confidence: "verified" | "partial";
}

export interface HostedAnalysisContextV64 {
  dataVersion: string;
  metaSnapshot?: string | null;
  goal: IntelligenceGoalV63;
  targetDiceId: string;
  resources: { gold: number; stone: number; solarCore?: number };
  route: HostedRouteSummaryV64 | null;
  alternatives: HostedRouteSummaryV64[];
  breakpoint: {
    decision: "spend" | "save" | "no-verified-gain";
    shortage: { gold: number; stone: number; solarCore?: number };
  };
  selectedNodeId?: string;
}

export class HostedAIClientError extends Error {
  constructor(public readonly code: string, public readonly status = 0) { super(code); }
}

const explanationCache = new Map<string, string>();

async function responseError(response: Response) {
  let code = `http_${response.status}`;
  try {
    const payload = await response.json() as { error?: unknown };
    if (payload.error) code = String(payload.error);
  } catch { /* A compact code is sufficient for fallback UI. */ }
  return new HostedAIClientError(code, response.status);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 9_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new HostedAIClientError("ai_timeout", 504);
    throw error;
  } finally { window.clearTimeout(timer); }
}

async function readStreamWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 9_000) {
  let timer: number | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new HostedAIClientError("ai_stream_timeout", 504)), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function ensureConfigured() {
  if (!isPlatformConfigured()) throw new HostedAIClientError("ai_endpoint_not_configured", 503);
}

export async function parseHostedIntentV64(input: {
  locale: "ko" | "en";
  question: string;
  current: {
    goal: IntelligenceGoalV63;
    targetDiceId: string;
    maxPurchases: number;
    resources: { gold: number; stone: number; solarCore?: number };
    knownDiceIds: string[];
    knownNodeIds: string[];
  };
}): Promise<IntelligenceCommandV64 & { targetNodeId?: string; comparisonNodeId?: string }> {
  ensureConfigured();
  const response = await fetchWithTimeout(platformUrl("/api/v1/ai"), {
    method: "POST",
    credentials: "omit",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ task: "parse_intent", ...input }),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { intent?: unknown };
  const parsed = hostedIntentSchema.safeParse(payload.intent);
  if (!parsed.success) throw new HostedAIClientError("ai_invalid_output", 422);
  return {
    tool: parsed.data.intent,
    ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
    ...(parsed.data.purchaseLimit ? { maxPurchases: parsed.data.purchaseLimit } : {}),
    ...(parsed.data.targetDiceId ? { targetDiceId: parsed.data.targetDiceId } : {}),
    ...(Object.keys(parsed.data.resourceDelta).length ? { resourceDelta: parsed.data.resourceDelta } : {}),
    ...(Object.keys(parsed.data.resourceOverride).length ? { resourceOverride: parsed.data.resourceOverride } : {}),
    ...(parsed.data.targetNodeId ? { targetNodeId: parsed.data.targetNodeId } : {}),
    ...(parsed.data.comparisonNodeId ? { comparisonNodeId: parsed.data.comparisonNodeId } : {}),
    confidence: "high",
    matched: ["hosted-intent"],
  };
}

function numericClaim(text: string) {
  return /[\d０-９%％]|(?:퍼센트|프로|배|절반|twofold|threefold)/i.test(text);
}

export async function streamHostedExplanationV64(input: {
  task: "explain_route" | "answer_followup";
  locale: "ko" | "en";
  question: string;
  context: HostedAnalysisContextV64;
}, onDelta: (text: string) => void) {
  ensureConfigured();
  const cacheKey = JSON.stringify(input);
  const cached = explanationCache.get(cacheKey);
  if (cached) { onDelta(cached); return { text: cached, cached: true, firstTokenMs: 0 }; }
  const started = performance.now();
  const response = await fetchWithTimeout(platformUrl("/api/v1/ai"), {
    method: "POST",
    credentials: "omit",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new HostedAIClientError("ai_empty_stream", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let firstTokenMs: number | null = null;
  const consume = (rawEvent: string) => {
    const eventName = rawEvent.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
    const data = rawEvent.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    let payload: { text?: unknown; error?: unknown } = {};
    try { payload = JSON.parse(data) as typeof payload; } catch { throw new HostedAIClientError("ai_invalid_stream", 502); }
    if (["unsafe", "error"].includes(eventName)) throw new HostedAIClientError(String(payload.error ?? "ai_stream_failed"), 502);
    if (eventName !== "delta" || typeof payload.text !== "string") return;
    if (numericClaim(text + payload.text)) throw new HostedAIClientError("ai_numeric_claim_rejected", 422);
    if (firstTokenMs === null) firstTokenMs = performance.now() - started;
    text += payload.text;
    onDelta(payload.text);
  };
  while (true) {
    const chunk = await readStreamWithTimeout(reader);
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) consume(event);
  }
  if (buffer.trim()) consume(buffer);
  if (!text.trim()) throw new HostedAIClientError("ai_empty_explanation", 502);
  explanationCache.set(cacheKey, text);
  if (explanationCache.size > 30) explanationCache.delete(explanationCache.keys().next().value!);
  return { text, cached: false, firstTokenMs };
}

export function isHostedAIConfiguredV64() {
  try { return isPlatformConfigured(); } catch (error) {
    if (error instanceof PlatformApiError) return false;
    return false;
  }
}
