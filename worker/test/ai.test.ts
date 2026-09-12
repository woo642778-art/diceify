// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import type { Env } from "../src/types";
import { testDatabase } from "./sqlite";

let database: ReturnType<typeof testDatabase>;
let env: Env;
const validIntent = {
  intent: "calculate_route", goal: "target-dice", targetDiceId: "predator",
  targetNodeId: null, comparisonNodeId: null, purchaseLimit: 4,
  resourceDelta: { stone: 100 }, resourceOverride: {},
};
const parseBody = {
  task: "parse_intent", locale: "ko", question: "포식 기준 다음 4개",
  current: {
    goal: "target-dice", targetDiceId: "predator", maxPurchases: 4,
    resources: { gold: 100_000, stone: 100, solarCore: 0 },
    knownDiceIds: ["predator", "solar"], knownNodeIds: ["5007", "5207"],
  },
};
const explainBody = {
  task: "explain_route", locale: "ko", question: "왜 이 경로야?",
  context: {
    dataVersion: "1.1.0:hash", metaSnapshot: "2026-08-16", goal: "target-dice", targetDiceId: "predator",
    resources: { gold: 100_000, stone: 100, solarCore: 0 },
    route: { nodeIds: ["5007"], cost: { gold: 0, stone: 8, solarCore: 0 }, remaining: { gold: 100_000, stone: 92, solarCore: 0 }, gainPercent: null, confidence: "partial" },
    alternatives: [], breakpoint: { decision: "no-verified-gain", shortage: { gold: 0, stone: 0, solarCore: 0 } },
    revisionId: "analysis:1234567890abcdef",
    decisionSupport: {
      stability: "medium", evidenceConfidence: "medium", reasons: ["검증된 구조 근거"],
      routeChangeBreakpoint: { resource: "stone", amount: 8, routeNodeIds: ["5207"] },
      contributions: [{ nodeId: "5007", fromRank: 0, toRank: 1, role: "direct", metric: "target-step", value: 1 }],
    },
  },
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return app.request("https://test.example/api/v1/ai", {
    method: "POST",
    headers: { Origin: "https://test.example", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.4", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }, env);
}

beforeEach(() => {
  database = testDatabase();
  env = {
    DB: database.db, APP_ENV: "test", APP_ORIGIN: "https://test.example", GAME_DATA_VERSION: "1.1.0",
    ALGORITHM_VERSION: "3", AI_DAILY_BUDGET: "100", AI_TIMEOUT_MS: "60",
    AI: { run: vi.fn(async () => ({ response: JSON.stringify(validIntent) })) },
    JOBS: { send: vi.fn() }, ASSETS: { fetch: () => new Response("asset") }, ROOMS: { idFromName: vi.fn(), get: vi.fn() },
  } as unknown as Env;
});
afterEach(() => database.close());

describe("Diceify hosted AI endpoint", () => {
  it("returns a validated structured intent and rejects unknown model IDs", async () => {
    const response = await request(parseBody);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({ intent: validIntent });
    env.AI = { run: vi.fn(async () => ({ response: JSON.stringify({ ...validIntent, targetNodeId: "unknown" }) })) } as unknown as Ai;
    expect((await request(parseBody)).status).toBe(422);
  });

  it("normalizes provider streaming and blocks numeric model claims", async () => {
    const stream = (payload: string) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ response: payload })}\n\n`)); controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); controller.close(); } });
    env.AI = { run: vi.fn(async () => stream("목표 효과와 후속 경로가 자연스럽게 이어집니다.")) } as unknown as Ai;
    const response = await request(explainBody);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("event: delta");
    env.AI = { run: vi.fn(async () => stream("효율이 7% 높습니다.")) } as unknown as Ai;
    const unsafe = await request(explainBody, { "CF-Connecting-IP": "192.0.2.5" });
    expect(await unsafe.text()).toContain("numeric_claim_rejected");
    env.AI = { run: vi.fn(async () => new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ response: "두" })}\n\n`));
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ response: " 배" })}\n\n`));
      controller.close();
    } })) } as unknown as Ai;
    const splitUnsafe = await request(explainBody, { "CF-Connecting-IP": "192.0.2.51" });
    expect(await splitUnsafe.text()).toContain("numeric_claim_rejected");
  });

  it("times out without exposing the provider and maps provider failures", async () => {
    env.AI = { run: vi.fn(() => new Promise(() => undefined)) } as unknown as Ai;
    expect((await request(parseBody)).status).toBe(504);
    env.AI = { run: vi.fn(async () => { throw new Error("provider 500"); }) } as unknown as Ai;
    const failed = await request(parseBody, { "CF-Connecting-IP": "192.0.2.6" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "ai_provider_failed" });
    env.AI = { run: vi.fn(async () => new ReadableStream<Uint8Array>({ start() { /* Intentionally stalled provider stream. */ } })) } as unknown as Ai;
    const stalled = await request(explainBody, { "CF-Connecting-IP": "192.0.2.61" });
    expect(stalled.status).toBe(200);
    expect(await stalled.text()).toContain("provider_stream_failed");
  });

  it("enforces per-visitor rate limits and the global daily quota", async () => {
    for (let index = 0; index < 12; index += 1) expect((await request(parseBody)).status).toBe(200);
    expect((await request(parseBody)).status).toBe(429);
    database.close();
    database = testDatabase();
    env.DB = database.db;
    env.AI_DAILY_BUDGET = "1";
    expect((await request(parseBody, { "CF-Connecting-IP": "192.0.2.7" })).status).toBe(200);
    expect((await request(parseBody, { "CF-Connecting-IP": "192.0.2.8" })).status).toBe(429);
  });

  it("rejects invalid output, oversized prompts, unsupported tasks, and foreign origins", async () => {
    env.AI = { run: vi.fn(async () => ({ response: "not-json" })) } as unknown as Ai;
    expect((await request(parseBody)).status).toBe(422);
    expect((await request({ ...parseBody, question: "가".repeat(801) }, { "CF-Connecting-IP": "192.0.2.9" })).status).toBe(400);
    expect((await request({ task: "generic_proxy", locale: "ko", question: "test" }, { "CF-Connecting-IP": "192.0.2.10" })).status).toBe(400);
    expect((await request(parseBody, { Origin: "https://evil.example", "CF-Connecting-IP": "192.0.2.11" })).status).toBe(403);
    const huge = JSON.stringify({ ...parseBody, question: "가".repeat(70_000) });
    expect((await request(huge, { "Content-Length": String(new TextEncoder().encode(huge).byteLength), "CF-Connecting-IP": "192.0.2.12" })).status).toBe(413);
    expect((await request(huge, { "Content-Length": "", "CF-Connecting-IP": "192.0.2.13" })).status).toBe(413);
  });

  it("degrades when AI is unavailable and supports CORS preflight", async () => {
    env.AI = undefined;
    expect((await request(parseBody)).status).toBe(503);
    const preflight = await app.request("https://test.example/api/v1/ai", { method: "OPTIONS", headers: { Origin: "https://test.example" } }, env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://test.example");
  });
});
