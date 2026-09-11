import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceRequestV63, IntelligenceResultV63 } from "./types";

const resultCache = new Map<string, IntelligenceResultV63>();
const pendingCache = new Map<string, Promise<IntelligenceResultV63>>();
const requests = new Map<string, {
  resolve: (result: IntelligenceResultV63) => void;
  reject: (error: Error) => void;
  timeout: number;
  key: string;
}>();
const CACHE_LIMIT = 40;
let optimizerWorker: Worker | undefined;
let initializedDataVersion: string | undefined;

function requestKey(request: IntelligenceRequestV63) {
  return JSON.stringify({ dataVersion: request.dataVersion, input: request.input, resources: request.resources, goal: request.goal, maxPurchases: request.maxPurchases, activeDeckIds: request.activeDeckIds });
}

function workerInstance() {
  if (optimizerWorker) return optimizerWorker;
  optimizerWorker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" });
  optimizerWorker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: IntelligenceResultV63; error?: string }>) => {
    const pending = requests.get(event.data.id);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    requests.delete(event.data.id);
    if (event.data.ok && event.data.result) {
      resultCache.set(pending.key, event.data.result);
      if (resultCache.size > CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value!);
      pending.resolve(event.data.result);
    } else pending.reject(new Error(event.data.error ?? "Intelligence worker failed"));
  };
  optimizerWorker.onerror = (event) => {
    for (const pending of requests.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(event.message || "Intelligence worker failed"));
    }
    requests.clear();
    optimizerWorker?.terminate();
    optimizerWorker = undefined;
    initializedDataVersion = undefined;
  };
  return optimizerWorker;
}

export function clearIntelligenceOptimizerCacheV64() {
  resultCache.clear();
  pendingCache.clear();
  for (const pending of requests.values()) window.clearTimeout(pending.timeout);
  requests.clear();
  optimizerWorker?.terminate();
  optimizerWorker = undefined;
  initializedDataVersion = undefined;
}

export function runIntelligenceOptimizerV63(data: CanonicalGameData, request: IntelligenceRequestV63) {
  const key = requestKey(request);
  const cached = resultCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pendingCache.get(key);
  if (existing) return existing;
  const calculation = new Promise<IntelligenceResultV63>((resolve, reject) => {
    const worker = workerInstance();
    if (initializedDataVersion !== request.dataVersion) {
      worker.postMessage({ kind: "initialize", dataVersion: request.dataVersion, data });
      initializedDataVersion = request.dataVersion;
    }
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      requests.delete(id);
      reject(new Error("Intelligence search exceeded 30 seconds"));
    }, 30_000);
    requests.set(id, { resolve, reject, timeout, key });
    worker.postMessage({ kind: "optimize", id, request });
  }).finally(() => pendingCache.delete(key));
  pendingCache.set(key, calculation);
  return calculation;
}
