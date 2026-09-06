import { moderateDeterministically, normalizeMessage } from "./domain/moderation";
import type { Env } from "./types";

interface Attachment { userId: string; displayName: string; roomId: string; sessionHash:string }
interface ClientMessage { type: "message"; body: string; nonce: string; replyToId?: string }

function parseClientMessage(value: string | ArrayBuffer): ClientMessage | null {
  try {
    const raw = JSON.parse(typeof value === "string" ? value : new TextDecoder().decode(value)) as Partial<ClientMessage>;
    if (raw.type !== "message" || typeof raw.body !== "string" || typeof raw.nonce !== "string") return null;
    const body = raw.body.trim();
    if (!body || body.length > 500 || raw.nonce.length > 80) return null;
    return { type: "message", body, nonce: raw.nonce, replyToId: typeof raw.replyToId === "string" ? raw.replyToId.slice(0, 80) : undefined };
  } catch { return null; }
}

export class ChatRoom implements DurableObject {
  private recent = new Map<string, Array<{ at: number; normalized: string }>>();

  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request) {
    const url=new URL(request.url);
    if(url.pathname==="/internal/moderation"&&request.method==="POST"&&request.headers.get("X-DiceTree-Internal")==="queue"){
      const packet=await request.json<{
        id:string;userId:string;displayName:string;body:string;nonce:string;replyToId:string|null;
        moderationState:"visible"|"hidden";createdAt:string;
      }>();
      if(packet.moderationState==="visible")await this.broadcastMessage({type:"message",...packet},packet.userId);
      else this.sendToUser(packet.userId,{type:"message-hidden",id:packet.id,moderationState:"hidden"});
      return Response.json({ok:true});
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
    const userId = request.headers.get("X-DiceTree-User");
    const displayName = request.headers.get("X-DiceTree-Name");
    const roomId = request.headers.get("X-DiceTree-Room");
    const sessionHash=request.headers.get("X-DiceTree-Session");
    if (!userId || !displayName || !roomId || !sessionHash) return new Response("Unauthorized", { status: 401 });
    if(this.ctx.getWebSockets().filter((socket)=>(socket.deserializeAttachment() as Attachment)?.userId===userId).length>=3)return new Response("Connection limit",{status:429});
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, displayName, roomId,sessionHash } satisfies Attachment);
    this.broadcast({ type: "presence", userId, displayName, state: "joined" }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    const parsed = parseClientMessage(message);
    if (!attachment || !parsed) {
      socket.send(JSON.stringify({ type: "error", code: "invalid_message" }));
      return;
    }
    const nowMs = Date.now();
    const timestamp=new Date(nowMs).toISOString();
    const membership=await this.env.DB.prepare(`SELECT r.slow_mode_seconds,m.muted_until,p.nickname FROM chat_members m
      JOIN chat_rooms r ON r.id=m.room_id AND r.state='open'
      JOIN users u ON u.id=m.user_id AND u.account_state='active'
      JOIN profiles p ON p.user_id=m.user_id
      JOIN sessions s ON s.user_id=m.user_id AND s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
      WHERE m.user_id=? AND m.room_id=? AND m.left_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM user_sanctions WHERE user_id=m.user_id AND active=1 AND level>=2 AND (ends_at IS NULL OR ends_at>?))`)
      .bind(attachment.sessionHash,timestamp,attachment.userId,attachment.roomId,timestamp).first<{slow_mode_seconds:number;muted_until:string|null;nickname:string}>();
    if(!membership||(membership.muted_until&&membership.muted_until>timestamp)){socket.close(1008,"membership_or_session_expired");return;}
    attachment.displayName=membership.nickname;
    const duplicate=await this.env.DB.prepare("SELECT id FROM chat_messages WHERE room_id=? AND user_id=? AND client_nonce=?").bind(attachment.roomId,attachment.userId,parsed.nonce).first<{id:string}>();
    if(duplicate){socket.send(JSON.stringify({type:"ack",nonce:parsed.nonce,id:duplicate.id,duplicate:true}));return;}
    const recentRows=await this.env.DB.prepare("SELECT body,created_at FROM chat_messages WHERE user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 30").bind(attachment.userId,new Date(nowMs-300000).toISOString()).all<{body:string;created_at:string}>();
    const lastAt=Date.parse(recentRows.results[0]?.created_at??"");
    if(Number.isFinite(lastAt)&&nowMs-lastAt<membership.slow_mode_seconds*1000){socket.send(JSON.stringify({type:"error",code:"slow_mode",nonce:parsed.nonce}));return;}
    if(parsed.replyToId&&!await this.env.DB.prepare("SELECT id FROM chat_messages WHERE id=? AND room_id=? AND moderation_state='visible'").bind(parsed.replyToId,attachment.roomId).first()){
      socket.send(JSON.stringify({type:"error",code:"reply_not_found",nonce:parsed.nonce}));return;
    }
    const history = (this.recent.get(attachment.userId) ?? []).filter((entry) => nowMs - entry.at < 5 * 60_000);
    for(const row of recentRows.results){const at=Date.parse(row.created_at);if(!history.some((entry)=>entry.at===at))history.push({at,normalized:normalizeMessage(row.body)});}
    const result = moderateDeterministically({
      body: parsed.body,
      recentNormalizedBodies: history.map((entry) => entry.normalized),
      messagesIn5Seconds: history.filter((entry) => nowMs - entry.at < 5_000).length + 1,
      messagesIn30Seconds: history.filter((entry) => nowMs - entry.at < 30_000).length + 1,
      mentions: (parsed.body.match(/@\S+/g) ?? []).length,
      links: (parsed.body.match(/https?:\/\//g) ?? []).length,
      priorLevel: 0,
    });
    history.push({ at: nowMs, normalized: normalizeMessage(parsed.body) });
    this.recent.set(attachment.userId, history);
    if (result.decision === "mute") {
      await this.env.DB.prepare("UPDATE chat_members SET muted_until=? WHERE room_id=? AND user_id=?").bind(new Date(nowMs+600000).toISOString(),attachment.roomId,attachment.userId).run();
      socket.send(JSON.stringify({ type: "moderation", decision: "mute", triggers: result.triggers }));
      return;
    }
    const id = crypto.randomUUID();
    const createdAt = new Date(nowMs).toISOString();
    const moderationState = result.decision === "review" ? "pending" : "visible";
    const insert = await this.env.DB.prepare(
      "INSERT INTO chat_messages (id, room_id, user_id, client_nonce, reply_to_id, body, moderation_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, user_id, client_nonce) DO NOTHING",
    ).bind(id, attachment.roomId, attachment.userId, parsed.nonce, parsed.replyToId ?? null, parsed.body, moderationState, createdAt).run();
    if (insert.meta.changes !== 1) {
      socket.send(JSON.stringify({ type: "ack", nonce: parsed.nonce, duplicate: true }));
      return;
    }
    await this.env.DB.prepare("INSERT INTO moderation_events (id, user_id, message_id, rule_score, ai_score, categories_json, decision, evidence_json, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), attachment.userId, id, result.score, JSON.stringify(result.triggers), result.decision, JSON.stringify({ aiReview: result.aiReview }), createdAt).run();
    if (result.aiReview) await this.env.JOBS.send({ kind: "moderate-message", messageId: id });
    const packet = { type: "message", id, nonce: parsed.nonce, userId: attachment.userId, displayName: attachment.displayName, body: parsed.body, replyToId: parsed.replyToId ?? null, moderationState, createdAt };
    if (moderationState === "visible") await this.broadcastMessage(packet,attachment.userId);
    else socket.send(JSON.stringify({ ...packet, type: "message-pending" }));
  }

  webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (attachment) this.broadcast({ type: "presence", userId: attachment.userId, displayName: attachment.displayName, state: "left" }, socket);
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "connection_error");
  }

  private broadcast(value: unknown, exclude?: WebSocket) {
    const packet = JSON.stringify(value);
    for (const socket of this.ctx.getWebSockets()) if (socket !== exclude) socket.send(packet);
  }

  private async broadcastMessage(value:unknown,sender:string){
    const blocked=await this.env.DB.prepare("SELECT blocker_id FROM user_blocks WHERE blocked_id=?").bind(sender).all<{blocker_id:string}>();
    const blockedBy=new Set(blocked.results.map((row)=>row.blocker_id));
    const packet=JSON.stringify(value);
    for(const socket of this.ctx.getWebSockets()){
      const recipient=socket.deserializeAttachment() as Attachment|null;
      if(recipient&&!blockedBy.has(recipient.userId)) { try{socket.send(packet);}catch{socket.close(1011,"delivery_failed");} }
    }
  }

  private sendToUser(userId:string,value:unknown){
    const packet=JSON.stringify(value);
    for(const socket of this.ctx.getWebSockets()){
      const recipient=socket.deserializeAttachment() as Attachment|null;
      if(recipient?.userId===userId){try{socket.send(packet);}catch{socket.close(1011,"delivery_failed");}}
    }
  }
}
