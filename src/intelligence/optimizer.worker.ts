/// <reference lib="webworker" />
import { optimizeIntelligenceRouteV63 } from "./optimizer";
import type { CanonicalGameData } from "../game-data/types";
import type { IntelligenceRequestV63 } from "./types";

type RequestMessage = { id: string; data: CanonicalGameData; request: IntelligenceRequestV63 };

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  try {
    const result = optimizeIntelligenceRouteV63(event.data.data, event.data.request);
    self.postMessage({ id: event.data.id, ok: true, result });
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
