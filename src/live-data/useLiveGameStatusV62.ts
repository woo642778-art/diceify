import { useCallback, useEffect, useState } from "react";
import { fetchLiveGameStatusV62, LIVE_GAME_STATUS_SNAPSHOT_V62 } from "./status";
import type { LiveGameStatusStateV62 } from "./types";

const REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 8_000;

export function useLiveGameStatusV62() {
  const [state, setState] = useState<LiveGameStatusStateV62>({
    data: LIVE_GAME_STATUS_SNAPSHOT_V62,
    phase: "snapshot",
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, phase: "refreshing", error: undefined }));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const data = await fetchLiveGameStatusV62(fetch, () => new Date(), controller.signal);
      setState({ data, phase: "live" });
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { ...state, refresh };
}
