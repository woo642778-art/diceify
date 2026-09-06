export type PlatformHealth = {
  ok: boolean;
  authConfigured: boolean;
  environment: string;
  gameDataVersion: string;
  algorithmVersion: string;
};

export type PlatformMe = {
  user: { id: string; displayName: string; avatarUrl: string | null; role: "user" | "moderator" | "admin" | "owner" };
  profile: Record<string, unknown> | null;
  points: number;
  csrf: string;
};

export class PlatformApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

const configuredOrigin = String(import.meta.env.VITE_PLATFORM_ORIGIN ?? "").replace(/\/$/, "");

export function isPlatformConfigured(location: Pick<Location, "hostname" | "port"> = window.location) {
  if (configuredOrigin) return true;
  if (location.hostname.endsWith("github.io")) return false;
  if ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && ["4173", "5173"].includes(location.port)) return false;
  return true;
}

export function platformUrl(path: string) {
  return `${configuredOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function platformWebSocketUrl(path: string) {
  const url = new URL(platformUrl(path), window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("Content-Type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() as unknown : null;
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : `http_${response.status}`;
    throw new PlatformApiError(response.status, code);
  }
  if (!payload) throw new PlatformApiError(response.status, "invalid_platform_response");
  return payload as T;
}

export async function platformGet<T>(path: string, signal?: AbortSignal) {
  const response = await fetch(platformUrl(path), { credentials: "include", signal, headers: { Accept: "application/json" } });
  return parseResponse<T>(response);
}

export async function platformMutate<T>(path: string, input: unknown, csrf: string, method: "POST" | "PUT" | "DELETE" = "POST", extraHeaders: Record<string, string> = {}) {
  const response = await fetch(platformUrl(path), {
    method,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-DiceTree-CSRF": csrf, ...extraHeaders },
    body: method === "DELETE" && input === undefined ? undefined : JSON.stringify(input ?? {}),
  });
  return parseResponse<T>(response);
}
