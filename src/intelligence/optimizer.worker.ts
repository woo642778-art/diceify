/// <reference lib="webworker" />
import { optimizeIntelligenceRouteV63 } from "./optimizer";
import { analyzeDecisionSupportV65 } from "./decisionSupport";
import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceRequestV63, MetaEvidenceV63 } from "./types";

type InitializeMessage = { kind: "initialize"; dataVersion: string; data: CanonicalGameData };
type RequestMessage = { kind: "optimize"; id: string; request: IntelligenceRequestV63; meta?: MetaEvidenceV63 | null };
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
    const support = analyzeDecisionSupportV65(canonicalData, event.data.request, result, event.data.meta ?? null);
    self.postMessage({ id: event.data.id, ok: true, result, support });
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
