export interface LedgerEntryInput {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function appendPointLedger(db: D1Database, input: LedgerEntryInput) {
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100_000) {
    throw new Error("invalid_point_amount");
  }
  const result = await db.prepare(
    `INSERT INTO point_ledger (id, user_id, amount, reason, idempotency_key, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(input.id, input.userId, input.amount, input.reason, input.idempotencyKey, JSON.stringify(input.metadata ?? {}), input.createdAt).run();
  const balance = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM point_ledger WHERE user_id = ?")
    .bind(input.userId).first<{ balance: number }>();
  return { inserted: result.meta.changes === 1, balance: Number(balance?.balance ?? 0) };
}

export async function redeemCatalogItem(db: D1Database, input: { id: string; ledgerId: string; userId: string; catalogId: string; idempotencyKey: string; createdAt: string }) {
  const item = await db.prepare("SELECT cost FROM point_catalog WHERE id = ? AND active = 1").bind(input.catalogId).first<{ cost: number }>();
  if (!item) throw new Error("catalog_item_not_found");
  const [ledgerResult] = await db.batch([
    db.prepare(
      `INSERT INTO point_ledger (id,user_id,amount,reason,idempotency_key,metadata_json,created_at)
       SELECT ?,?,-?,'catalog_redemption',?,?,?
       WHERE (SELECT COALESCE(SUM(amount),0) FROM point_ledger WHERE user_id=?) >= ?
       ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(input.ledgerId,input.userId,item.cost,input.idempotencyKey,JSON.stringify({ catalogId:input.catalogId }),input.createdAt,input.userId,item.cost),
    db.prepare(
      `INSERT INTO point_redemptions (id,user_id,catalog_id,cost,ledger_id,created_at)
       SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM point_ledger WHERE id=? AND idempotency_key=?)
       ON CONFLICT(ledger_id) DO NOTHING`,
    ).bind(input.id,input.userId,input.catalogId,item.cost,input.ledgerId,input.createdAt,input.ledgerId,input.idempotencyKey),
  ]);
  if (ledgerResult.meta.changes !== 1) {
    const existing = await db.prepare("SELECT id FROM point_ledger WHERE idempotency_key=? AND user_id=?").bind(input.idempotencyKey,input.userId).first();
    if (!existing) throw new Error("insufficient_points");
  }
  const balance = await db.prepare("SELECT COALESCE(SUM(amount),0) AS balance FROM point_ledger WHERE user_id=?").bind(input.userId).first<{ balance:number }>();
  return { inserted: ledgerResult.meta.changes === 1, balance:Number(balance?.balance ?? 0) };
}
