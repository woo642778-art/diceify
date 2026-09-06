import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env, SessionUser } from "./types";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) { try { return decodeURIComponent(value.join("=")); } catch { return undefined; } }
  }
  return undefined;
}

export function cookie(name: string, value: string, options: { httpOnly?: boolean; maxAge?: number } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "Secure", "SameSite=Lax"];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

export async function verifyGoogleIdToken(idToken: string, clientId: string) {
  const verified = await jwtVerify(idToken, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  const subject = verified.payload.sub;
  const displayName = typeof verified.payload.name === "string" ? verified.payload.name : "DiceTree Player";
  const email = verified.payload.email_verified === true && typeof verified.payload.email === "string" ? verified.payload.email : null;
  const avatarUrl = typeof verified.payload.picture === "string" ? verified.payload.picture : null;
  if (!subject) throw new Error("google_subject_missing");
  return { subject, displayName, email, avatarUrl };
}

export async function currentSession(request: Request, env: Env): Promise<SessionUser | null> {
  const token = cookieValue(request, "dt_session");
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.role, COALESCE(p.nickname,'DiceTree Player') AS display_name, u.avatar_url, s.csrf_hash
     FROM sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN profiles p ON p.user_id=u.id
     WHERE s.id_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.account_state = 'active'`,
  ).bind(hash, new Date().toISOString()).first<{ id: string; role: SessionUser["role"]; display_name: string; avatar_url: string | null; csrf_hash: string }>();
  if (!row) return null;
  const csrf = cookieValue(request, "dt_csrf") ?? "";
  if (!csrf || await sha256(csrf) !== row.csrf_hash) return null;
  return { id: row.id, role: row.role, displayName: row.display_name, avatarUrl: row.avatar_url, csrf };
}

export async function createApplicationSession(env: Env, userId: string) {
  const token = randomToken(36);
  const csrf = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await env.DB.prepare("INSERT INTO sessions (id_hash, user_id, csrf_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(token), userId, await sha256(csrf), now.toISOString(), now.toISOString(), expires.toISOString()).run();
  return { token, csrf, maxAge: 30 * 24 * 60 * 60 };
}

export async function verifyTurnstile(request: Request, env: Env, token?: string) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  const connectingIp = request.headers.get("CF-Connecting-IP");
  if (connectingIp) form.set("remoteip", connectingIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = await response.json<{ success?: boolean }>();
  return result.success === true;
}
