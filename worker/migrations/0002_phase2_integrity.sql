-- Additive only. Run after 0001; no production seed users or metrics.
ALTER TABLE events ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_snapshot_version ON planner_snapshots(user_id,state_version);
ALTER TABLE planner_snapshots ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX idx_snapshot_request ON planner_snapshots(user_id,request_id) WHERE request_id IS NOT NULL;
ALTER TABLE saved_builds ADD COLUMN parent_build_id TEXT REFERENCES saved_builds(id) ON DELETE SET NULL;
CREATE INDEX idx_build_parent ON saved_builds(parent_build_id);
CREATE INDEX idx_submission_aggregate ON event_submissions(game_data_version,review_state,created_at,user_id);
CREATE INDEX idx_moderation_pending ON chat_messages(moderation_state,created_at);
CREATE TABLE party_members (
  post_id TEXT NOT NULL REFERENCES matchmaking_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('dealer','support','balanced')),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(post_id,user_id)
);
CREATE TABLE feature_flags (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK(rollout_percent BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL
);
CREATE TABLE rate_windows (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_expiry ON rate_windows(expires_at);
