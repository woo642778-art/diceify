export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  JOBS: Queue;
  AI?: Ai;
  ASSETS: Fetcher;
  APP_ENV: string;
  APP_ORIGIN: string;
  GAME_DATA_VERSION: string;
  ALGORITHM_VERSION: string;
  AI_DAILY_BUDGET: string;
  AI_MODEL?: string;
  AI_TIMEOUT_MS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET?: string;
  OWNER_GOOGLE_EMAIL?: string;
}

export interface SessionUser {
  id: string;
  role: "user" | "moderator" | "admin" | "owner";
  displayName: string;
  avatarUrl: string | null;
  csrf: string;
}
