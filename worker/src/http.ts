import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) throw new HTTPException(415, { message: "json_required" });
  const reader = request.body?.getReader();
  if (!reader) throw new HTTPException(400, { message: "invalid_json" });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > 256_000) { await reader.cancel(); throw new HTTPException(413, { message: "payload_too_large" }); }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HTTPException(400, { message: "invalid_json" }); }
  return schema.parse(value);
}

export async function consumeQuota(db: D1Database, key: string, limit: number, seconds: number) {
  const current = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(current / seconds);
  const result = await db.prepare("INSERT INTO rate_windows(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count")
    .bind(`${key}:${bucket}`,current+seconds,limit).first();
  return Boolean(result);
}
