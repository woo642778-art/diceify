/// <reference lib="webworker" />
import { optimizeIntelligenceRouteV63 } from "./optimizer";
import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceRequestV63 } from "./types";

type InitializeMessage = { kind: "initialize"; dataVersion: string; data: CanonicalGameData };
type RequestMessage = { kind: "optimize"; id: string; request: IntelligenceRequestV63 };
let canonicalData: CanonicalGameData | undefined;
let canonicalDataVersion: string | undefined;

self.onmessage = (event: MessageEvent<InitializeMessage | RequestMessage>) => {
  if (event.data.kind === "initialize") {
    canonicalData = event.data.data;
    canonicalDataVersion = event.data.dataVersion;
    return;
  }
  try {
    if (!canonicalData || canonicalDataVersion !== event.data.request.dataVersion) throw new Error("Intelligence worker data is not initialized");
    const result = optimizeIntelligenceRouteV63(canonicalData, event.data.request);
    self.postMessage({ id: event.data.id, ok: true, result });
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
