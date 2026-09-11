import type { Env } from "../types";
import { hostedIntentSchema, type AiAnalysisRequest, type HostedIntent } from "./schemas";

export interface DiceifyAIProvider {
  parseIntent(request: Extract<AiAnalysisRequest, { task: "parse_intent" }>): Promise<HostedIntent>;
  explainResult(request: Extract<AiAnalysisRequest, { task: "explain_route" | "answer_followup" }>): Promise<ReadableStream<Uint8Array>>;
}

export class HostedAiError extends Error {
  constructor(public readonly code: "unavailable" | "timeout" | "invalid_output" | "quota", message: string = code) {
    super(message);
  }
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const encoder = new TextEncoder();

function configuredModel(env: Env) {
  return env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

function configuredTimeout(env: Env) {
  const parsed = Number(env.AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 50 && parsed <= 30_000 ? parsed : 8_000;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new HostedAiError("timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function responseText(result: unknown) {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "response" in result) return String((result as { response: unknown }).response);
  return JSON.stringify(result);
}

function cleanJson(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function validateIntent(value: unknown, request: Extract<AiAnalysisRequest, { task: "parse_intent" }>) {
  const parsed = hostedIntentSchema.safeParse(value);
  if (!parsed.success) throw new HostedAiError("invalid_output");
  if (parsed.data.targetDiceId && !request.current.knownDiceIds.includes(parsed.data.targetDiceId)) throw new HostedAiError("invalid_output", "unknown_dice_id");
  for (const nodeId of [parsed.data.targetNodeId, parsed.data.comparisonNodeId]) {
    if (nodeId && !request.current.knownNodeIds.includes(nodeId)) throw new HostedAiError("invalid_output", "unknown_node_id");
  }
  return parsed.data;
}

function qualitativeOnly(text: string) {
  return !/[\d０-９%％]|(?:퍼센트|프로|배|절반|두\s*배|threefold)/i.test(text);
}

function extractStreamText(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  if ("response" in payload && typeof (payload as { response?: unknown }).response === "string") return (payload as { response: string }).response;
  const choices = (payload as { choices?: Array<{ delta?: { content?: unknown }; text?: unknown }> }).choices;
  const choice = choices?.[0];
  if (typeof choice?.delta?.content === "string") return choice.delta.content;
  if (typeof choice?.text === "string") return choice.text;
  return "";
}

function sseEvent(event: string, value: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function normalizedExplanationStream(source: unknown, timeoutMs: number): ReadableStream<Uint8Array> {
  if (!(source instanceof ReadableStream)) {
    const text = responseText(source);
    return new ReadableStream({
      start(controller) {
        if (!qualitativeOnly(text)) controller.enqueue(sseEvent("unsafe", { error: "numeric_claim_rejected" }));
        else if (text) controller.enqueue(sseEvent("delta", { text }));
        controller.enqueue(sseEvent("done", { ok: qualitativeOnly(text) }));
        controller.close();
      },
    });
  }
  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedText = "";
      let total = 0;
      let unsafe = false;
      const emitPayload = (raw: string) => {
        if (!raw || raw === "[DONE]" || unsafe) return;
        let text = "";
        try { text = extractStreamText(JSON.parse(raw)); } catch { text = raw; }
        if (!text) return;
        total += text.length;
        const candidate = emittedText + text;
        if (total > 1_600 || !qualitativeOnly(candidate)) {
          unsafe = true;
          controller.enqueue(sseEvent("unsafe", { error: "numeric_claim_rejected" }));
          return;
        }
        emittedText = candidate;
        controller.enqueue(sseEvent("delta", { text }));
      };
      try {
        while (true) {
          const chunk = await withTimeout(reader.read(), timeoutMs);
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";
          for (const event of events) {
            const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            emitPayload(data);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          const data = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n") || buffer.trim();
          emitPayload(data);
        }
        controller.enqueue(sseEvent("done", { ok: !unsafe }));
        controller.close();
      } catch {
        controller.enqueue(sseEvent("error", { error: "provider_stream_failed" }));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export class CloudflareWorkersAIProvider implements DiceifyAIProvider {
  constructor(private readonly env: Env) {}

  async parseIntent(request: Extract<AiAnalysisRequest, { task: "parse_intent" }>) {
    if (!this.env.AI) throw new HostedAiError("unavailable");
    const result = await withTimeout(Promise.resolve(this.env.AI.run(configuredModel(this.env) as keyof AiModels, {
      messages: [
        { role: "system", content: "Interpret one Korean or English Diceify command. Return only strict JSON matching the supplied shape. Never calculate a route. Use only supplied dice and node IDs. Unknown fields are forbidden." },
        { role: "user", content: JSON.stringify({ question: request.question, current: request.current, output: { intent: "calculate_route | compare_routes | find_breakpoint | explain_result", goal: "goal or null", targetDiceId: "known ID or null", targetNodeId: "known ID or null", comparisonNodeId: "known ID or null", purchaseLimit: "integer 1-8 or null", resourceDelta: {}, resourceOverride: {} } }) },
      ],
      max_tokens: 240,
      response_format: { type: "json_object" },
    } as never)), configuredTimeout(this.env));
    let value: unknown;
    try { value = JSON.parse(cleanJson(responseText(result))); } catch { throw new HostedAiError("invalid_output"); }
    return validateIntent(value, request);
  }

  async explainResult(request: Extract<AiAnalysisRequest, { task: "explain_route" | "answer_followup" }>) {
    if (!this.env.AI) throw new HostedAiError("unavailable");
    const system = request.locale === "ko"
      ? "Diceify의 간결한 전략 설명자다. 계산은 제공된 엔진 결과만 권위가 있다. 숫자, 수량, 비율, 노드 ID를 절대 쓰지 말고 경로가 선택된 질적 이유만 한국어 두세 문장으로 설명하라. 숨은 추론은 노출하지 마라."
      : "You are Diceify's concise strategy explainer. The engine payload is authoritative. Never write numbers, quantities, percentages, or node IDs. Explain only the qualitative reason in two or three sentences. Do not expose hidden reasoning.";
    const result = await withTimeout(Promise.resolve(this.env.AI.run(configuredModel(this.env) as keyof AiModels, {
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ question: request.question, context: request.context }) }],
      max_tokens: 320,
      stream: true,
    } as never)), configuredTimeout(this.env));
    return normalizedExplanationStream(result, configuredTimeout(this.env));
  }
}

export function createDiceifyAIProvider(env: Env): DiceifyAIProvider {
  return new CloudflareWorkersAIProvider(env);
}
