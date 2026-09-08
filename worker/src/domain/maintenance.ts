export type MaintenanceResult = {
  expiredSessions: number;
  expiredRateWindows: number;
  expiredMatchmakingPosts: number;
  closedEvents: number;
  expiredSanctions: number;
  deletedNotifications: number;
};

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Daily maintenance deliberately preserves user builds, planner snapshots,
 * chats, point ledgers and audit logs. Only transient operational records are
 * removed; expired domain objects are state-transitioned instead of deleted.
 */
export async function runScheduledMaintenance(db: D1Database, at = new Date()): Promise<MaintenanceResult> {
  const timestamp = at.toISOString();
  const epochSeconds = Math.floor(at.getTime() / 1000);
  const revokedSessionCutoff = daysBefore(at, 30);
  const readNotificationCutoff = daysBefore(at, 90);
  const unreadNotificationCutoff = daysBefore(at, 365);
  const results = await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at<=? OR (revoked_at IS NOT NULL AND revoked_at<=?)").bind(timestamp,revokedSessionCutoff),
    db.prepare("DELETE FROM rate_windows WHERE expires_at<=?").bind(epochSeconds),
    db.prepare("UPDATE matchmaking_posts SET state='expired',updated_at=? WHERE state IN ('open','full') AND expires_at<=?").bind(timestamp,timestamp),
    db.prepare("UPDATE events SET status='closed',updated_at=? WHERE status='active' AND ends_at<=?").bind(timestamp,timestamp),
    db.prepare("UPDATE user_sanctions SET active=0,updated_at=? WHERE active=1 AND ends_at IS NOT NULL AND ends_at<=?").bind(timestamp,timestamp),
    db.prepare("DELETE FROM notifications WHERE (read_at IS NOT NULL AND created_at<?) OR (read_at IS NULL AND created_at<?)").bind(readNotificationCutoff,unreadNotificationCutoff),
  ]);
  return {
    expiredSessions:Number(results[0].meta.changes ?? 0),
    expiredRateWindows:Number(results[1].meta.changes ?? 0),
    expiredMatchmakingPosts:Number(results[2].meta.changes ?? 0),
    closedEvents:Number(results[3].meta.changes ?? 0),
    expiredSanctions:Number(results[4].meta.changes ?? 0),
    deletedNotifications:Number(results[5].meta.changes ?? 0),
  };
}
