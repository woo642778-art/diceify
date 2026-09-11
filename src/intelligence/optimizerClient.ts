import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceRequestV63, IntelligenceResultV63 } from "./types";

export function runIntelligenceOptimizerV63(data: CanonicalGameData, request: IntelligenceRequestV63) {
  return new Promise<IntelligenceResultV63>((resolve, reject) => {
    const worker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" });
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Intelligence search exceeded 30 seconds"));
    }, 30_000);
    worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: IntelligenceResultV63; error?: string }>) => {
      if (event.data.id !== id) return;
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok && event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "Intelligence worker failed"));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "Intelligence worker failed"));
    };
    worker.postMessage({ id, data, request });
  });
}
