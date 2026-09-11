import {
  CreateWebWorkerMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
  type InitProgressReport,
  type WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import type { LocalModelOptionV63 } from "./modelCatalog";
import { IntelligenceIntentSchemaV63 } from "../grounding";

let engine: WebWorkerMLCEngine | null = null;
let activeModelId: string | null = null;
let worker: Worker | null = null;

export async function isLocalModelCachedV63(modelId: string) {
  return hasModelInCache(modelId);
}

export async function startLocalModelV63(
  model: LocalModelOptionV63,
  onProgress: (report: InitProgressReport) => void,
) {
  if (!("gpu" in navigator)) throw new Error("WebGPU unavailable");
  if (engine && activeModelId === model.modelId) return engine;
  if (engine) await engine.unload();
  worker?.terminate();
  worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  engine = await CreateWebWorkerMLCEngine(worker, model.modelId, {
    initProgressCallback: onProgress,
    logLevel: "WARN",
  });
  activeModelId = model.modelId;
  return engine;
}

export async function explainWithLocalModelV63(prompt: string) {
  if (!engine || !activeModelId) throw new Error("Local model is not loaded");
  const completion = await engine.chat.completions.create({
    model: activeModelId,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    top_p: 0.8,
    max_tokens: 360,
  });
  const content = completion.choices[0]?.message.content;
  return typeof content === "string" ? content.trim() : "";
}

export async function parseIntentWithLocalModelV63(question: string) {
  if (!engine || !activeModelId) throw new Error("Local model is not loaded");
  const completion = await engine.chat.completions.create({
    model: activeModelId,
    messages: [
      { role: "system", content: "Parse Diceify user intent. Return JSON only with tool, goal, and optional maxPurchases. tool must be calculate_route, compare_routes, find_breakpoint, or explain_result. goal must be basic-dps, resource-efficiency, target-dice, pvp, or coop. maxPurchases must be an integer from 1 to 8. Do not answer the question." },
      { role: "user", content: question },
    ],
    temperature: 0,
    max_tokens: 100,
  });
  const content = completion.choices[0]?.message.content;
  if (typeof content !== "string") throw new Error("Local model returned no intent");
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Local model returned invalid intent JSON");
  return IntelligenceIntentSchemaV63.parse(JSON.parse(json));
}

export function interruptLocalModelV63() {
  engine?.interruptGenerate();
}

export async function unloadLocalModelV63() {
  if (engine) await engine.unload();
  engine = null;
  activeModelId = null;
  worker?.terminate();
  worker = null;
}

export async function deleteLocalModelV63(modelId: string) {
  if (activeModelId === modelId) await unloadLocalModelV63();
  await deleteModelAllInfoInCache(modelId);
}
