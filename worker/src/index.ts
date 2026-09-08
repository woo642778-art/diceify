import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { parseJson, consumeQuota } from "./http";
import { phase2Routes } from "./routes/phase2";
import { appendPointLedger, redeemCatalogItem } from "./domain/points";
import { ChatRoom } from "./chatRoom";
import { adminReportActionSchema, appealSchema, buildSchema, eventSubmissionSchema, matchmakingSchema, profileSchema, reactionSchema, recommendationFeedbackSchema, reportSchema, roomSchema, syncSchema } from "./schemas";
import { communitySignal, rebuildCommunityDeckSegment, rebuildCommunityDeckSegmentByMode } from "./domain/recommendations";
import { cookie, cookieValue, createApplicationSession, currentSession, randomToken, sha256, verifyGoogleIdToken, verifyTurnstile } from "./security";
import type { Env, SessionUser } from "./types";

type AppVariables = { user: SessionUser };
type AppEnv = { Bindings: Env; Variables: AppVariables };
const app = new Hono<AppEnv>();

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const jsonText = (value: unknown) => JSON.stringify(value);

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' https://lh3.googleusercontent.com data:; connect-src 'self' https://accounts.google.com wss:; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline'; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
});

app.onError((error, c) => {
  if (error instanceof z.ZodError) return c.json({ error:"invalid_input",issues:error.issues.map((issue) => ({ path:issue.path,code:issue.code })) },400);
  if (error instanceof HTTPException) return c.json({ error:error.message },error.status);
  console.error(jsonText({ event: "request_error", path: c.req.path }));
  return c.json({ error: "internal_error" }, 500);
});

const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentSession(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  c.header("Cache-Control", "private, no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== c.env.APP_ORIGIN) return c.json({ error:"origin_failed" },403);
    if (c.req.header("X-DiceTree-CSRF") !== user.csrf) return c.json({ error: "csrf_failed" }, 403);
    if (!await consumeQuota(c.env.DB,`mutation:${user.id}`,60,60)) return c.json({ error:"rate_limited" },429);
  }
  await next();
};

async function deckFingerprint(deck: readonly string[]) {
  return sha256([...deck].sort().join("|"));
}

app.get("/api/v1/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ ok: database?.ok === 1, authConfigured:Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),environment: c.env.APP_ENV, gameDataVersion: c.env.GAME_DATA_VERSION, algorithmVersion: c.env.ALGORITHM_VERSION });
});

app.get("/auth/google/start", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "google_auth_not_configured" }, 503);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const redirectUri = `${c.env.APP_ORIGIN}/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  c.header("Set-Cookie", cookie("dt_oauth_state", state, { httpOnly: true, maxAge: 600 }), { append: true });
  c.header("Set-Cookie", cookie("dt_oauth_verifier", verifier, { httpOnly: true, maxAge: 600 }), { append: true });
  return c.redirect(url.toString());
});

app.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || state !== cookieValue(c.req.raw, "dt_oauth_state")) return c.json({ error: "oauth_state_failed" }, 400);
  const verifier = cookieValue(c.req.raw, "dt_oauth_verifier");
  if (!verifier || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.json({ error: "google_auth_not_configured" }, 503);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${c.env.APP_ORIGIN}/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier }),
  });
  if (!tokenResponse.ok) return c.json({ error: "oauth_exchange_failed" }, 401);
  const tokens = await tokenResponse.json<{ id_token?: string }>();
  if (!tokens.id_token) return c.json({ error: "id_token_missing" }, 401);
  const identity = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_CLIENT_ID);
  const timestamp = now();
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE provider = 'google' AND provider_subject = ?").bind(identity.subject).first<{ id: string }>();
  const userId = existing?.id ?? id();
  if (existing) {
    await c.env.DB.prepare("UPDATE users SET display_name = ?, avatar_url = ?, email = ?, updated_at = ? WHERE id = ?")
      .bind(identity.displayName, identity.avatarUrl, identity.email, timestamp, userId).run();
  } else {
    const role = c.env.OWNER_GOOGLE_EMAIL && identity.email === c.env.OWNER_GOOGLE_EMAIL ? "owner" : "user";
    await c.env.DB.prepare("INSERT INTO users (id, provider, provider_subject, email, display_name, avatar_url, role, created_at, updated_at) VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, identity.subject, identity.email, identity.displayName, identity.avatarUrl, role, timestamp, timestamp).run();
  }
  const session = await createApplicationSession(c.env, userId);
  c.header("Set-Cookie", cookie("dt_session", session.token, { httpOnly: true, maxAge: session.maxAge }), { append: true });
  c.header("Set-Cookie", cookie("dt_csrf", session.csrf, { maxAge: session.maxAge }), { append: true });
  c.header("Set-Cookie", cookie("dt_oauth_state", "", { httpOnly: true, maxAge: 0 }), { append: true });
  c.header("Set-Cookie", cookie("dt_oauth_verifier", "", { httpOnly: true, maxAge: 0 }), { append: true });
  return c.redirect("/dicetree/");
});

const publicGetRoutes = new Set([
  "/api/v1/health",
  "/api/v1/builds/public",
  "/api/v1/community/rooms",
  "/api/v1/matchmaking/open",
  "/api/v1/events/active",
  "/api/v1/points/catalog",
]);

app.use("/api/v1/*", async (c, next) => {
  const isPublicRecommendation = c.req.method === "GET" && c.req.path.startsWith("/api/v1/recommendations/community/");
  if (c.req.method === "GET" && /^\/api\/v1\/builds\/[^/]+$/.test(c.req.path)) { await next(); return; }
  if ((c.req.method === "GET" && publicGetRoutes.has(c.req.path)) || isPublicRecommendation) {
    await next();
    return;
  }
  return requireUser(c, next);
});
app.use("/ws/*", requireUser);

app.get("/api/v1/me", async (c) => {
  const user = c.get("user");
  const profile = await c.env.DB.prepare("SELECT nickname, mode, preferred_role, spend_profile, data_consent, recommendation_opt_out, reputation FROM profiles WHERE user_id = ?").bind(user.id).first();
  const points = await c.env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM point_ledger WHERE user_id = ?").bind(user.id).first<{ balance: number }>();
  return c.json({ user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role }, profile, points: Number(points?.balance ?? 0), csrf: user.csrf });
});

app.post("/api/v1/me/logout", async (c) => {
  const token = cookieValue(c.req.raw, "dt_session");
  if (token) await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id_hash = ?").bind(now(), await sha256(token)).run();
  c.header("Set-Cookie", cookie("dt_session", "", { httpOnly: true, maxAge: 0 }), { append: true });
  c.header("Set-Cookie", cookie("dt_csrf", "", { maxAge: 0 }), { append: true });
  return c.json({ ok: true });
});

app.put("/api/v1/profile", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, profileSchema);
  if (!await verifyTurnstile(c.req.raw, c.env, input.turnstileToken)) return c.json({ error: "turnstile_failed" }, 403);
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO profiles (user_id, nickname, mode, preferred_role, spend_profile, data_consent, recommendation_opt_out, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, mode=excluded.mode, preferred_role=excluded.preferred_role, spend_profile=excluded.spend_profile, data_consent=excluded.data_consent, recommendation_opt_out=excluded.recommendation_opt_out, updated_at=excluded.updated_at`,
  ).bind(user.id, input.nickname, input.mode, input.preferredRole, input.spendProfile, Number(input.dataConsent), Number(input.recommendationOptOut), timestamp, timestamp).run();
  await c.env.JOBS.send({ kind: "rebuild-community-all" });
  return c.json({ ok: true, updatedAt: timestamp });
});

app.get("/api/v1/sync", async (c) => {
  const user = c.get("user");
  const snapshot = await c.env.DB.prepare("SELECT id, state_json, state_version, schema_version, game_data_version, updated_at FROM planner_snapshots WHERE user_id = ? ORDER BY state_version DESC LIMIT 1").bind(user.id).first<{ id: string; state_json: string; state_version: number; schema_version: number; game_data_version: string; updated_at: string }>();
  return c.json({ snapshot: snapshot ? { ...snapshot, state: JSON.parse(snapshot.state_json), state_json: undefined } : null });
});

app.put("/api/v1/sync", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, syncSchema);
  if (input.requestId) {
    const replay = await c.env.DB.prepare("SELECT state_version FROM planner_snapshots WHERE user_id=? AND request_id=?").bind(user.id,input.requestId).first<{state_version:number}>();
    if (replay) return c.json({ ok:true,version:replay.state_version,replayed:true });
  }
  const latest = await c.env.DB.prepare("SELECT id, state_json, state_version, schema_version, updated_at FROM planner_snapshots WHERE user_id = ? ORDER BY state_version DESC LIMIT 1").bind(user.id).first<{ id: string; state_json: string; state_version: number; schema_version: number; updated_at: string }>();
  const currentVersion = latest?.state_version ?? 0;
  if (input.expectedVersion !== currentVersion) return c.json({ error: "sync_conflict", latest: latest ? { version: currentVersion, state: JSON.parse(latest.state_json), schemaVersion: latest.schema_version, updatedAt: latest.updated_at } : null }, 409);
  const timestamp = now();
  const version = currentVersion + 1;
  const inserted = await c.env.DB.prepare("INSERT INTO planner_snapshots (id,user_id,state_json,state_version,schema_version,source,game_data_version,created_at,updated_at,request_id) SELECT ?,?,?,?,?,'cloud-save',?,?,?,? WHERE (SELECT COALESCE(MAX(state_version),0) FROM planner_snapshots WHERE user_id=?)=? ON CONFLICT DO NOTHING")
    .bind(id(),user.id,jsonText(input.state),version,input.schemaVersion,c.env.GAME_DATA_VERSION,timestamp,timestamp,input.requestId??null,user.id,input.expectedVersion).run();
  if (inserted.meta.changes !== 1) return c.json({ error:"sync_conflict" },409);
  return c.json({ ok: true, version, updatedAt: timestamp });
});

app.get("/api/v1/builds/public", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT b.slug, b.title, b.description, b.mode, b.deck_json, b.total_gold, b.total_core, b.game_data_version, b.updated_at,
      p.nickname, COUNT(DISTINCT l.user_id) AS likes, COUNT(DISTINCT cp.id) AS copies
     FROM saved_builds b JOIN profiles p ON p.user_id=b.owner_id
     LEFT JOIN build_likes l ON l.build_id=b.id LEFT JOIN build_copy_events cp ON cp.build_id=b.id
     WHERE b.visibility='public' GROUP BY b.id ORDER BY b.updated_at DESC LIMIT 30`,
  ).all();
  return c.json({ builds: rows.results });
});

app.post("/api/v1/builds", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, buildSchema);
  const buildId = id();
  const slug = randomToken(6).slice(0, 8);
  const timestamp = now();
  const payload = { ...input, gameDataVersion: c.env.GAME_DATA_VERSION };
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO saved_builds (id, owner_id, slug, visibility, title, description, mode, deck_json, tree_json, total_gold, total_core, game_data_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(buildId, user.id, slug, input.visibility, input.title, input.description, input.mode, jsonText(input.deck), jsonText(input.tree), input.totalGold, input.totalCore, c.env.GAME_DATA_VERSION, timestamp, timestamp),
    c.env.DB.prepare("INSERT INTO build_versions (id, build_id, version, payload_json, created_at) VALUES (?, ?, 1, ?, ?)").bind(id(), buildId, jsonText(payload), timestamp),
  ]);
  return c.json({ id: buildId, slug, version: 1 }, 201);
});

app.get("/api/v1/builds/:slug", async (c) => {
  const user = await currentSession(c.req.raw,c.env);
  const row = await c.env.DB.prepare("SELECT b.*,p.nickname FROM saved_builds b LEFT JOIN profiles p ON p.user_id=b.owner_id WHERE b.slug=? AND (b.visibility!='private' OR b.owner_id=?)").bind(c.req.param("slug"),user?.id??"").first<Record<string, unknown>>();
  if (!row) return c.json({ error: "build_not_found" }, 404);
  c.header("Cache-Control","private, no-store");
  return c.json({ build: row });
});

app.post("/api/v1/builds/:slug/copy", async (c) => {
  const user = c.get("user");
  const build = await c.env.DB.prepare("SELECT id FROM saved_builds WHERE slug = ? AND (visibility != 'private' OR owner_id = ?)").bind(c.req.param("slug"), user.id).first<{ id: string }>();
  if (!build) return c.json({ error: "build_not_found" }, 404);
  await c.env.DB.prepare("INSERT INTO build_copy_events (id, build_id, user_id, created_at) VALUES (?, ?, ?, ?)").bind(id(), build.id, user.id, now()).run();
  return c.json({ ok: true });
});

app.post("/api/v1/builds/:slug/like", async (c) => {
  const user = c.get("user");
  const build = await c.env.DB.prepare("SELECT id FROM saved_builds WHERE slug = ? AND visibility = 'public'").bind(c.req.param("slug")).first<{ id: string }>();
  if (!build) return c.json({ error: "build_not_found" }, 404);
  await c.env.DB.prepare("INSERT INTO build_likes (build_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(build_id,user_id) DO NOTHING").bind(build.id, user.id, now()).run();
  return c.json({ ok: true });
});

app.post("/api/v1/builds/:slug/favorite", async (c) => {
  const user = c.get("user");
  const build = await c.env.DB.prepare("SELECT id FROM saved_builds WHERE slug = ? AND visibility != 'private'").bind(c.req.param("slug")).first<{ id: string }>();
  if (!build) return c.json({ error: "build_not_found" }, 404);
  const existing = await c.env.DB.prepare("SELECT 1 AS found FROM build_favorites WHERE build_id=? AND user_id=?").bind(build.id, user.id).first();
  if (existing) await c.env.DB.prepare("DELETE FROM build_favorites WHERE build_id=? AND user_id=?").bind(build.id, user.id).run();
  else await c.env.DB.prepare("INSERT INTO build_favorites (build_id,user_id,created_at) VALUES (?,?,?)").bind(build.id,user.id,now()).run();
  return c.json({ favorited: !existing });
});

app.get("/api/v1/me/builds", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT slug,title,description,visibility,mode,deck_json,total_gold,total_core,game_data_version,updated_at FROM saved_builds WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
  return c.json({ builds: rows.results });
});

app.get("/api/v1/me/favorites", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT b.slug,b.title,b.mode,b.deck_json,b.game_data_version,b.updated_at FROM build_favorites f JOIN saved_builds b ON b.id=f.build_id WHERE f.user_id=? AND b.visibility!='private' ORDER BY f.created_at DESC LIMIT 100").bind(user.id).all();
  return c.json({ builds: rows.results });
});

app.get("/api/v1/events/active", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id,title,description,starts_at,ends_at,reward_points FROM events WHERE status='active' AND starts_at<=? AND ends_at>? ORDER BY ends_at ASC LIMIT 20").bind(now(),now()).all();
  return c.json({ events: rows.results });
});

app.post("/api/v1/events/:eventId/submissions", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, eventSubmissionSchema);
  const event = await c.env.DB.prepare("SELECT id, reward_points FROM events WHERE id=? AND status='active' AND starts_at<=? AND ends_at>?").bind(c.req.param("eventId"), now(), now()).first<{ id: string; reward_points: number }>();
  if (!event) return c.json({ error: "event_not_active" }, 404);
  const submissionId = id();
  const createdAt = now();
  const results=await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO event_submissions(id,event_id,user_id,deck_fingerprint,mode,purpose,description,deck_json,game_data_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id,user_id) DO NOTHING")
      .bind(submissionId,event.id,user.id,await deckFingerprint(input.deck),input.mode,input.purpose,input.description,jsonText(input.deck),c.env.GAME_DATA_VERSION,createdAt),
    c.env.DB.prepare(`INSERT INTO point_ledger(id,user_id,amount,reason,idempotency_key,metadata_json,created_at)
      SELECT ?,?,?,'favorite_deck_event',?,?,? WHERE ?>0 AND EXISTS(SELECT 1 FROM event_submissions WHERE id=?)
      ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(id(),user.id,event.reward_points,`favorite-deck-event:${event.id}:${user.id}`,jsonText({submissionId}),createdAt,event.reward_points,submissionId),
  ]);
  if(results[0].meta.changes!==1)return c.json({error:"event_already_submitted"},409);
  const reward={inserted:results[1].meta.changes===1};
  await c.env.JOBS.send({ kind: "aggregate-deck", submissionId });
  return c.json({ id: submissionId, reward }, 201);
});

app.get("/api/v1/points/ledger", async (c) => {
  const user = c.get("user");
  const [entries, balance] = await Promise.all([
    c.env.DB.prepare("SELECT amount, reason, metadata_json, created_at FROM point_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS balance FROM point_ledger WHERE user_id=?").bind(user.id).first<{ balance: number }>(),
  ]);
  return c.json({ balance: Number(balance?.balance ?? 0), entries: entries.results });
});

app.get("/api/v1/points/catalog", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id,name,category,cost,metadata_json FROM point_catalog WHERE active=1 ORDER BY cost,id LIMIT 100").all();
  return c.json({ items: rows.results });
});

app.post("/api/v1/points/redeem/:catalogId", async (c) => {
  const user = c.get("user");
  const requestKey = c.req.header("Idempotency-Key")?.trim();
  if (!requestKey || requestKey.length > 100) return c.json({ error: "idempotency_key_required" }, 400);
  const redemptionId = id();
  try {
    return c.json(await redeemCatalogItem(c.env.DB, { id: redemptionId, ledgerId: id(), userId: user.id, catalogId: c.req.param("catalogId"), idempotencyKey: `redemption:${user.id}:${c.req.param("catalogId")}:${requestKey}`, createdAt: now() }), 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "redemption_failed";
    return c.json({ error: code }, code === "insufficient_points" ? 409 : 404);
  }
});

app.get("/api/v1/community/rooms", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id,title,category,description,max_members,visibility,tags_json,slow_mode_seconds,updated_at FROM chat_rooms WHERE state='open' AND visibility='public' ORDER BY updated_at DESC LIMIT 50").all();
  return c.json({ rooms: rows.results });
});

app.post("/api/v1/community/rooms", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, roomSchema);
  if (!await verifyTurnstile(c.req.raw, c.env, input.turnstileToken)) return c.json({ error: "turnstile_failed" }, 403);
  const active = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE owner_id=? AND state='open'").bind(user.id).first<{ count: number }>();
  if (Number(active?.count ?? 0) >= 5) return c.json({ error: "room_limit_reached" }, 429);
  const roomId = id();
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO chat_rooms (id,owner_id,title,category,description,max_members,visibility,join_requirement,tags_json,slow_mode_seconds,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(roomId,user.id,input.title,input.category,input.description,input.maxMembers,input.visibility,input.joinRequirement,jsonText(input.tags),input.slowModeSeconds,timestamp,timestamp),
    c.env.DB.prepare("INSERT INTO chat_members (room_id,user_id,room_role,joined_at) VALUES (?,?,'host',?)").bind(roomId,user.id,timestamp),
  ]);
  return c.json({ id: roomId }, 201);
});

app.post("/api/v1/community/rooms/:roomId/join", async (c) => {
  const user = c.get("user");
  const roomId = c.req.param("roomId");
  const room = await c.env.DB.prepare("SELECT max_members,state FROM chat_rooms WHERE id=?").bind(roomId).first<{ max_members:number; state:string }>();
  if (!room || room.state !== "open") return c.json({ error: "room_not_found" }, 404);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM chat_members WHERE room_id=? AND left_at IS NULL").bind(roomId).first<{ count:number }>();
  if (Number(count?.count ?? 0) >= room.max_members) return c.json({ error: "room_full" }, 409);
  await c.env.DB.prepare("INSERT INTO chat_members (room_id,user_id,room_role,joined_at,left_at) VALUES (?,?,'member',?,NULL) ON CONFLICT(room_id,user_id) DO UPDATE SET left_at=NULL,joined_at=excluded.joined_at").bind(roomId,user.id,now()).run();
  return c.json({ ok: true });
});

app.get("/api/v1/community/rooms/:roomId/messages", async (c) => {
  const user = c.get("user");
  const membership = await c.env.DB.prepare("SELECT 1 AS found FROM chat_members WHERE room_id=? AND user_id=? AND left_at IS NULL").bind(c.req.param("roomId"),user.id).first();
  if (!membership) return c.json({ error: "room_membership_required" }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT m.id,m.body,m.reply_to_id,m.created_at,u.id AS user_id,COALESCE(p.nickname,'Deleted player') AS display_name
     FROM chat_messages m LEFT JOIN users u ON u.id=m.user_id
     LEFT JOIN profiles p ON p.user_id=u.id
     WHERE m.room_id=? AND m.moderation_state='visible'
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id=? AND b.blocked_id=m.user_id)
     ORDER BY m.created_at DESC LIMIT 100`,
  ).bind(c.req.param("roomId"),user.id).all();
  return c.json({ messages: [...rows.results].reverse() });
});

app.post("/api/v1/community/messages/:messageId/reactions", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw,reactionSchema);
  const membership = await c.env.DB.prepare("SELECT m.id FROM chat_messages m JOIN chat_members cm ON cm.room_id=m.room_id AND cm.user_id=? AND cm.left_at IS NULL WHERE m.id=? AND m.moderation_state='visible'").bind(user.id,c.req.param("messageId")).first();
  if (!membership) return c.json({error:"message_not_found"},404);
  await c.env.DB.prepare("INSERT INTO chat_reactions (message_id,user_id,reaction,created_at) VALUES (?,?,?,?) ON CONFLICT(message_id,user_id,reaction) DO NOTHING").bind(c.req.param("messageId"),user.id,input.reaction,now()).run();
  return c.json({ ok: true });
});

app.get("/ws/rooms/:roomId", async (c) => {
  const user = c.get("user");
  const roomId = c.req.param("roomId");
  if (c.req.header("Origin") !== c.env.APP_ORIGIN) return c.json({error:"origin_failed"},403);
  const membership = await c.env.DB.prepare("SELECT r.state, m.muted_until FROM chat_rooms r JOIN chat_members m ON m.room_id=r.id AND m.user_id=? AND m.left_at IS NULL WHERE r.id=? AND r.state='open'").bind(user.id, roomId).first<{ state: string; muted_until: string | null }>();
  if (!membership) return c.json({ error: "room_not_found" }, 404);
  if (membership.muted_until && membership.muted_until > now()) return c.json({ error: "muted" }, 403);
  const sanction = await c.env.DB.prepare("SELECT id FROM user_sanctions WHERE user_id=? AND active=1 AND (ends_at IS NULL OR ends_at>?) LIMIT 1").bind(user.id, now()).first();
  if (sanction) return c.json({ error: "sanctioned" }, 403);
  const durableId = c.env.ROOMS.idFromName(roomId);
  return c.env.ROOMS.get(durableId).fetch(new Request(c.req.raw, { headers: { ...Object.fromEntries(c.req.raw.headers), "X-DiceTree-User": user.id, "X-DiceTree-Name": user.displayName, "X-DiceTree-Room": roomId,"X-DiceTree-Session":await sha256(cookieValue(c.req.raw,"dt_session")??"") } }));
});

app.get("/api/v1/matchmaking/open", async (c) => {
  const kind = c.req.query("kind");
  if (kind !== "coop" && kind !== "crit") return c.json({ error: "invalid_kind" }, 400);
  const rows = await c.env.DB.prepare("SELECT id,kind,target,role,looking_for,deck_json,beginner_ok,capacity,current_members,expires_at,created_at FROM matchmaking_posts WHERE kind=? AND state='open' AND expires_at>? ORDER BY created_at DESC LIMIT 50").bind(kind, now()).all();
  return c.json({ posts: rows.results });
});

app.post("/api/v1/matchmaking", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, matchmakingSchema);
  const postId = id();
  const roomId = id();
  const timestamp = new Date();
  const expiresAt = new Date(timestamp.getTime() + input.expiresInMinutes * 60_000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO chat_rooms(id,owner_id,title,category,max_members,visibility,created_at,updated_at) VALUES(?,?,?,?,?,'unlisted',?,?)").bind(roomId,user.id,input.target,input.kind,input.capacity,timestamp.toISOString(),timestamp.toISOString()),
    c.env.DB.prepare("INSERT INTO chat_members(room_id,user_id,room_role,joined_at) VALUES(?,?,'host',?)").bind(roomId,user.id,timestamp.toISOString()),
    c.env.DB.prepare("INSERT INTO matchmaking_posts(id,room_id,owner_id,kind,target,role,looking_for,deck_json,beginner_ok,capacity,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(postId,roomId,user.id,input.kind,input.target,input.role,input.lookingFor,jsonText(input.deck),Number(input.beginnerOk),input.capacity,expiresAt,timestamp.toISOString(),timestamp.toISOString()),
    c.env.DB.prepare("INSERT INTO party_members(post_id,user_id,role,joined_at) VALUES(?,?,?,?)").bind(postId,user.id,input.role,timestamp.toISOString()),
  ]);
  return c.json({ id:postId,roomId,expiresAt },201);
});

app.post("/api/v1/reports", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw, reportSchema);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_reports WHERE reporter_id=? AND created_at>?").bind(user.id, new Date(Date.now()-24*60*60*1000).toISOString()).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 20) return c.json({ error: "report_limit_reached" }, 429);
  const reportId = id();
  const timestamp = now();
  await c.env.DB.prepare("INSERT INTO user_reports (id,reporter_id,subject_user_id,message_id,reason,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(reportId,user.id,input.subjectUserId ?? null,input.messageId ?? null,input.reason,input.detail,timestamp,timestamp).run();
  return c.json({ id: reportId }, 201);
});

app.put("/api/v1/blocks/:userId", async (c) => {
  const user = c.get("user");
  if (user.id === c.req.param("userId")) return c.json({ error: "cannot_block_self" }, 400);
  await c.env.DB.prepare("INSERT INTO user_blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?) ON CONFLICT(blocker_id,blocked_id) DO NOTHING").bind(user.id,c.req.param("userId"),now()).run();
  return c.json({ ok: true });
});

app.get("/api/v1/recommendations/community/:segment", async (c) => {
  const segment=c.req.param("segment");
  if(!["pvp","coop","crit"].includes(segment))return c.json({error:"invalid_segment"},400);
  const rows = await c.env.DB.prepare(`SELECT a.deck_fingerprint,a.sample_count,a.weighted_count,a.positive_count,a.negative_count,a.window_start,a.window_end,
    (SELECT COUNT(DISTINCT eligible.user_id) FROM event_submissions eligible
      JOIN profiles eligible_profile ON eligible_profile.user_id=eligible.user_id AND eligible_profile.data_consent=1 AND eligible_profile.recommendation_opt_out=0
      JOIN users eligible_user ON eligible_user.id=eligible.user_id AND eligible_user.account_state='active'
      WHERE eligible.mode=a.segment_key AND eligible.deck_fingerprint=a.deck_fingerprint AND eligible.game_data_version=a.game_data_version
        AND eligible.review_state='accepted' AND eligible.created_at>=a.window_start AND eligible.created_at<=a.window_end) AS current_sample_count,
    (SELECT es.deck_json FROM event_submissions es
      JOIN profiles p ON p.user_id=es.user_id AND p.data_consent=1 AND p.recommendation_opt_out=0
      JOIN users u ON u.id=es.user_id AND u.account_state='active'
      WHERE es.mode=a.segment_key AND es.deck_fingerprint=a.deck_fingerprint AND es.game_data_version=a.game_data_version
        AND es.review_state='accepted' AND es.created_at>=a.window_start AND es.created_at<=a.window_end
      ORDER BY es.created_at DESC LIMIT 1) AS deck_json
    FROM community_deck_aggregates a WHERE a.segment_key=? AND a.game_data_version=? AND a.algorithm_version=? ORDER BY a.weighted_count DESC LIMIT 30`).bind(segment,c.env.GAME_DATA_VERSION,c.env.ALGORITHM_VERSION).all<{ deck_fingerprint:string; sample_count:number; current_sample_count:number; weighted_count:number; positive_count:number; negative_count:number; window_start:string; window_end:string;deck_json:string|null }>();
  const decks=rows.results.flatMap((row) => {
    const currentSampleCount = Number(row.current_sample_count);
    const community = communitySignal({ positive: Math.min(row.positive_count,currentSampleCount), total: currentSampleCount, weightedCount: Math.min(row.weighted_count,currentSampleCount * 1.5) });
    if (!community.eligible || !row.deck_json) return [];
    return [{
      deck_fingerprint:row.deck_fingerprint,
      sample_count:currentSampleCount,
      weighted_count:row.weighted_count,
      positive_count:Math.min(row.positive_count,currentSampleCount),
      negative_count:row.negative_count,
      window_start:row.window_start,
      window_end:row.window_end,
      deck_json:row.deck_json,
      community,
    }];
  });
  return c.json({
    segment,
    gameDataVersion: c.env.GAME_DATA_VERSION,
    algorithmVersion: c.env.ALGORITHM_VERSION,
    decks,
  });
});

app.post("/api/v1/recommendations/feedback", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw,recommendationFeedbackSchema);
  const recommendation = await c.env.DB.prepare("SELECT id FROM recommendation_events WHERE id=? AND (user_id=? OR user_id IS NULL)").bind(input.recommendationId,user.id).first();
  if (!recommendation) return c.json({ error: "recommendation_not_found" }, 404);
  await c.env.DB.prepare("INSERT INTO recommendation_feedback (id,recommendation_id,user_id,outcome,rating,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recommendation_id,user_id) DO UPDATE SET outcome=excluded.outcome,rating=excluded.rating,created_at=excluded.created_at").bind(id(),input.recommendationId,user.id,input.outcome,input.rating ?? null,now()).run();
  return c.json({ ok: true });
});

app.get("/api/v1/notifications", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT id,kind,payload_json,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
  return c.json({ notifications: rows.results });
});

app.post("/api/v1/notifications/:notificationId/read", async (c) => {
  const user = c.get("user");
  const result = await c.env.DB.prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?").bind(now(),c.req.param("notificationId"),user.id).run();
  if (result.meta.changes !== 1) return c.json({ error: "notification_not_found" }, 404);
  return c.json({ ok: true });
});

app.get("/api/v1/me/sanctions", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT id,level,reason,starts_at,ends_at,active FROM user_sanctions WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
  return c.json({ sanctions: rows.results });
});

app.post("/api/v1/me/appeals", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c.req.raw,appealSchema);
  const sanction = await c.env.DB.prepare("SELECT id FROM user_sanctions WHERE id=? AND user_id=?").bind(input.sanctionId,user.id).first();
  if (!sanction) return c.json({ error: "sanction_not_found" }, 404);
  const appealId = id();
  const timestamp = now();
  await c.env.DB.prepare("INSERT INTO appeals (id,sanction_id,user_id,statement,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(appealId,input.sanctionId,user.id,input.statement,timestamp,timestamp).run();
  return c.json({ id: appealId }, 201);
});

app.get("/api/v1/me/export", async (c) => {
  const user = c.get("user");
  const tables = ["profiles","user_preferences","planner_snapshots","saved_builds","point_ledger","event_submissions","matchmaking_posts","notifications"] as const;
  const output: Record<string, unknown> = { exportedAt: now(), userId: user.id };
  for (const table of tables) output[table] = (await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${table === "profiles" || table === "user_preferences" ? "user_id" : table === "saved_builds" || table === "matchmaking_posts" ? "owner_id" : "user_id"}=?`).bind(user.id).all()).results;
  return c.json(output);
});

app.delete("/api/v1/me", async (c) => {
  const user = c.get("user");
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET email=NULL, display_name='Deleted player', avatar_url=NULL, account_state='deleted', deleted_at=?, updated_at=? WHERE id=?").bind(timestamp,timestamp,user.id),
    c.env.DB.prepare("UPDATE profiles SET nickname=?,data_consent=0,recommendation_opt_out=1,updated_at=? WHERE user_id=?").bind(`Deleted-${user.id}`,timestamp,user.id),
    c.env.DB.prepare("DELETE FROM planner_snapshots WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM user_preferences WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM saved_builds WHERE owner_id=? AND visibility!='public'").bind(user.id),
    c.env.DB.prepare("DELETE FROM build_likes WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM build_favorites WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM chat_reactions WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("UPDATE chat_messages SET user_id=NULL WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM matchmaking_posts WHERE owner_id=?").bind(user.id),
    c.env.DB.prepare("UPDATE recommendation_events SET user_id=NULL WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
  ]);
  await c.env.JOBS.send({ kind: "rebuild-community-all" });
  c.header("Set-Cookie", cookie("dt_session", "", { httpOnly: true, maxAge: 0 }), { append: true });
  c.header("Set-Cookie", cookie("dt_csrf", "", { maxAge: 0 }), { append: true });
  return c.json({ ok: true });
});

app.get("/api/v1/admin/overview", async (c) => {
  const user = c.get("user");
  if (!["admin","owner"].includes(user.role)) return c.json({ error: "forbidden" }, 403);
  const [users, rooms, reports, sockets] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE account_state='active'").first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE state='open'").first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_reports WHERE state='open'").first(),
    Promise.resolve({ count: null }),
  ]);
  return c.json({ users, rooms, reports, sockets, environment: c.env.APP_ENV });
});

app.get("/api/v1/admin/reports", async (c) => {
  const user = c.get("user");
  if (!["admin","owner"].includes(user.role)) return c.json({ error: "forbidden" }, 403);
  const rows = await c.env.DB.prepare("SELECT id,reporter_id,subject_user_id,message_id,reason,detail,state,created_at,updated_at FROM user_reports WHERE state IN ('open','reviewing') ORDER BY created_at ASC LIMIT 100").all();
  return c.json({ reports: rows.results });
});

app.post("/api/v1/admin/reports/:reportId/action", async (c) => {
  const user = c.get("user");
  if (!["admin","owner"].includes(user.role)) return c.json({ error: "forbidden" }, 403);
  const input = await parseJson(c.req.raw,adminReportActionSchema);
  const report = await c.env.DB.prepare("SELECT subject_user_id FROM user_reports WHERE id=?").bind(c.req.param("reportId")).first<{ subject_user_id:string|null }>();
  if (!report) return c.json({ error: "report_not_found" }, 404);
  const timestamp = now();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE user_reports SET state=?,updated_at=? WHERE id=?").bind(input.state,timestamp,c.req.param("reportId")),
    c.env.DB.prepare("INSERT INTO admin_audit_logs (id,admin_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(id(),user.id,`report:${input.state}`,"report",c.req.param("reportId"),jsonText({ resolution: input.resolution, sanctionLevel: input.sanctionLevel }),timestamp),
  ];
  if (input.sanctionLevel && report.subject_user_id) {
    const endsAt = input.sanctionHours ? new Date(Date.now()+input.sanctionHours*60*60*1000).toISOString() : null;
    statements.push(c.env.DB.prepare("INSERT INTO user_sanctions (id,user_id,level,reason,starts_at,ends_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id(),report.subject_user_id,input.sanctionLevel,input.resolution || "community_safety",timestamp,endsAt,user.id,timestamp,timestamp));
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

app.route("/api/v1",phase2Routes);
app.get("/", (c) => c.redirect("/dicetree/"));
app.all("*", (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === "/dicetree") url.pathname = "/";
  else if (url.pathname.startsWith("/dicetree/")) url.pathname = url.pathname.slice("/dicetree".length) || "/";
  return c.env.ASSETS.fetch(new Request(url,c.req.raw));
});

const aiModerationSchema = z.object({ harassment: z.number().min(0).max(1), hate: z.number().min(0).max(1), sexual: z.number().min(0).max(1), threat: z.number().min(0).max(1), profanity: z.number().min(0).max(1), spam: z.number().min(0).max(1), personal_information: z.number().min(0).max(1), context_confidence: z.number().min(0).max(1) }).strict();

function parseAiModerationResult(value:unknown){
  try{
    const text=typeof value==="string"?value:JSON.stringify(value);
    return aiModerationSchema.safeParse(JSON.parse(text.replace(/^```json\s*|\s*```$/g,"")));
  }catch{return aiModerationSchema.safeParse(null);}
}

async function publishModerationDecision(env:Env,row:{room_id:string;user_id:string|null;body:string;client_nonce:string;reply_to_id:string|null;created_at:string},messageId:string,state:"visible"|"hidden"){
  if(!row.user_id)return;
  const profile=await env.DB.prepare("SELECT nickname FROM profiles WHERE user_id=?").bind(row.user_id).first<{nickname:string}>();
  const objectId=env.ROOMS.idFromName(row.room_id);
  await env.ROOMS.get(objectId).fetch("https://dicetree.internal/internal/moderation",{
    method:"POST",
    headers:{"Content-Type":"application/json","X-DiceTree-Internal":"queue"},
    body:jsonText({id:messageId,userId:row.user_id,displayName:profile?.nickname??"Deleted player",body:row.body,nonce:row.client_nonce,replyToId:row.reply_to_id,moderationState:state,createdAt:row.created_at}),
  });
}

async function handleQueue(batch: MessageBatch<unknown>, env: Env) {
  for (const message of batch.messages) {
    try {
      const body = message.body as { kind?: string; messageId?: string };
      if (body.kind === "aggregate-deck" && typeof (body as {submissionId?:unknown}).submissionId === "string") {
        await rebuildCommunityDeckSegment(env.DB, {
          submissionId: (body as {submissionId:string}).submissionId,
          gameDataVersion: env.GAME_DATA_VERSION,
          algorithmVersion: env.ALGORITHM_VERSION,
        });
      } else if (body.kind === "rebuild-community-all") {
        for (const segment of ["pvp","coop","crit"] as const) {
          await rebuildCommunityDeckSegmentByMode(env.DB, {
            segment,
            gameDataVersion: env.GAME_DATA_VERSION,
            algorithmVersion: env.ALGORITHM_VERSION,
          });
        }
      } else if (body.kind === "moderate-message" && body.messageId) {
        const row = await env.DB.prepare("SELECT room_id,user_id,body,client_nonce,reply_to_id,created_at FROM chat_messages WHERE id=? AND moderation_state='pending'").bind(body.messageId).first<{ room_id:string;user_id:string|null;body:string;client_nonce:string;reply_to_id:string|null;created_at:string }>();
        if (!row) { message.ack(); continue; }
        if(!env.AI){
          await env.DB.batch([
            env.DB.prepare("UPDATE chat_messages SET moderation_state='visible' WHERE id=? AND moderation_state='pending'").bind(body.messageId),
            env.DB.prepare("UPDATE moderation_events SET categories_json=?,decision=? WHERE message_id=?").bind(jsonText({ai_unavailable:true}),"visible_rule_only",body.messageId),
          ]);
          await publishModerationDecision(env,row,body.messageId,"visible");
          message.ack();continue;
        }
        const dayStart = new Date();
        dayStart.setUTCHours(0,0,0,0);
        const used = await env.DB.prepare("SELECT COUNT(*) AS count FROM moderation_events WHERE ai_score IS NOT NULL AND created_at>=?").bind(dayStart.toISOString()).first<{ count:number }>();
        const dailyBudget = Math.max(0,Number(env.AI_DAILY_BUDGET) || 0);
        if (Number(used?.count ?? 0) >= dailyBudget) {
          await env.DB.batch([
            env.DB.prepare("UPDATE chat_messages SET moderation_state='visible' WHERE id=? AND moderation_state='pending'").bind(body.messageId),
            env.DB.prepare("UPDATE moderation_events SET categories_json=?,decision=? WHERE message_id=?").bind(jsonText({ai_budget_exhausted:true}),"visible_rule_only",body.messageId),
          ]);
          await publishModerationDecision(env,row,body.messageId,"visible");
          message.ack();
          continue;
        }
        const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it" as keyof AiModels, { messages: [{ role: "system", content: "Classify Korean game-chat safety. Return only JSON with harassment, hate, sexual, threat, profanity, spam, personal_information, context_confidence numbers from 0 to 1. Distinguish untargeted exclamation from targeted abuse." }, { role: "user", content: row.body }] } as never);
        const responseText = typeof result === "object" && result && "response" in result ? String((result as { response:unknown }).response) : result;
        const raw = typeof responseText === "string" ? responseText : JSON.stringify(responseText);
        const parsed = parseAiModerationResult(raw);
        const severe = parsed.success ? Math.max(parsed.data.harassment, parsed.data.hate, parsed.data.threat, parsed.data.personal_information) : 0;
        const moderationState=parsed.success&&severe>=0.82?"hidden":"visible";
        await env.DB.batch([
          env.DB.prepare("UPDATE chat_messages SET moderation_state=? WHERE id=?").bind(moderationState, body.messageId),
          env.DB.prepare("UPDATE moderation_events SET ai_score=?,categories_json=?,decision=? WHERE message_id=?").bind(parsed.success ? severe : null,parsed.success ? jsonText(parsed.data) : jsonText({ parse_failed:true }),parsed.success?moderationState:"visible_parse_failed",body.messageId),
        ]);
        await publishModerationDecision(env,row,body.messageId,moderationState);
      }
      message.ack();
    } catch (error) {
      console.error(jsonText({ event: "queue_error", message: error instanceof Error ? error.message : "unknown" }));
      message.retry({ delaySeconds: 30 });
    }
  }
}

export { ChatRoom, app, handleQueue };
export default { fetch: app.fetch, queue: handleQueue } satisfies ExportedHandler<Env>;
