import type { CanonicalGameData } from "../game-data/types";
import { stableSerializeAnalysisRequestV65 } from "./analysisState";
import type { IntelligenceAnalysisPacketV65, DecisionSupportV65 } from "./decisionSupport";
import type { IntelligenceRequestV63, IntelligenceResultV63, MetaEvidenceV63 } from "./types";

const resultCache = new Map<string, IntelligenceAnalysisPacketV65>();
const pendingCache = new Map<string, Promise<IntelligenceAnalysisPacketV65>>();
const requests = new Map<string, {
  resolve: (result: IntelligenceAnalysisPacketV65) => void;
  reject: (error: Error) => void;
  timeout: number;
  key: string;
  detachAbort?: () => void;
}>();
const CACHE_LIMIT = 40;
let optimizerWorker: Worker | undefined;
let initializedDataVersion: string | undefined;

function requestKey(request: IntelligenceRequestV63, meta?: MetaEvidenceV63 | null) {
  return `${stableSerializeAnalysisRequestV65(request)}|meta:${meta?.snapshotDate ?? "none"}:${meta?.sampleSize ?? 0}`;
}

function workerInstance() {
  if (optimizerWorker) return optimizerWorker;
  optimizerWorker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" });
  optimizerWorker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: IntelligenceResultV63; support?: DecisionSupportV65; error?: string }>) => {
    const pending = requests.get(event.data.id);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    pending.detachAbort?.();
    requests.delete(event.data.id);
    if (event.data.ok && event.data.result && event.data.support) {
      const packet = { result: event.data.result, support: event.data.support };
      resultCache.set(pending.key, packet);
      if (resultCache.size > CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value!);
      pending.resolve(packet);
    } else pending.reject(new Error(event.data.error ?? "Intelligence worker failed"));
  };
  optimizerWorker.onerror = (event) => {
    for (const pending of requests.values()) {
      window.clearTimeout(pending.timeout);
      pending.detachAbort?.();
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
  for (const pending of requests.values()) {
    window.clearTimeout(pending.timeout);
    pending.detachAbort?.();
    pending.reject(new DOMException("Intelligence optimizer reset", "AbortError"));
  }
  requests.clear();
  optimizerWorker?.terminate();
  optimizerWorker = undefined;
  initializedDataVersion = undefined;
}

export function runIntelligenceAnalysisV65(data: CanonicalGameData, request: IntelligenceRequestV63, meta: MetaEvidenceV63 | null = null, options: { signal?: AbortSignal } = {}) {
  const key = requestKey(request, meta);
  const cached = resultCache.get(key);
  if (cached) return Promise.resolve(cached);
  if (options.signal?.aborted) return Promise.reject(new DOMException("Intelligence search cancelled", "AbortError"));
  const existing = options.signal ? undefined : pendingCache.get(key);
  if (existing) return existing;
  const calculation = new Promise<IntelligenceAnalysisPacketV65>((resolve, reject) => {
    const worker = workerInstance();
    if (initializedDataVersion !== request.dataVersion) {
      worker.postMessage({ kind: "initialize", dataVersion: request.dataVersion, data });
      initializedDataVersion = request.dataVersion;
    }
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      const pending = requests.get(id);
      pending?.detachAbort?.();
      requests.delete(id);
      reject(new Error("Intelligence search exceeded 30 seconds"));
    }, 30_000);
    const abort = () => {
      const pending = requests.get(id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      pending.detachAbort?.();
      requests.delete(id);
      reject(new DOMException("Intelligence search cancelled", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    requests.set(id, { resolve, reject, timeout, key, ...(options.signal ? { detachAbort: () => options.signal?.removeEventListener("abort", abort) } : {}) });
    worker.postMessage({ kind: "optimize", id, request, meta });
  }).finally(() => { if (!options.signal) pendingCache.delete(key); });
  if (!options.signal) pendingCache.set(key, calculation);
  return calculation;
}

export async function runIntelligenceOptimizerV63(data: CanonicalGameData, request: IntelligenceRequestV63, options: { signal?: AbortSignal } = {}) {
  return (await runIntelligenceAnalysisV65(data, request, null, options)).result;
}
