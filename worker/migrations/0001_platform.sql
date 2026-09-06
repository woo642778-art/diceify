PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'google'),
  provider_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin', 'owner')),
  account_state TEXT NOT NULL DEFAULT 'active' CHECK (account_state IN ('active', 'deleting', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mode TEXT NOT NULL CHECK (mode IN ('pvp', 'coop', 'crit', 'mixed')),
  preferred_role TEXT NOT NULL CHECK (preferred_role IN ('dealer', 'support', 'balanced')),
  spend_profile TEXT NOT NULL CHECK (spend_profile IN ('free', 'light', 'invested')),
  data_consent INTEGER NOT NULL DEFAULT 0 CHECK (data_consent IN (0, 1)),
  recommendation_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (recommendation_opt_out IN (0, 1)),
  reputation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE planner_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  state_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('local-import', 'cloud-save', 'conflict-backup', 'build-copy')),
  game_data_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_planner_user_updated ON planner_snapshots(user_id, updated_at DESC);

CREATE TABLE saved_builds (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('pvp', 'coop', 'crit', 'mixed')),
  deck_json TEXT NOT NULL,
  tree_json TEXT NOT NULL,
  total_gold INTEGER NOT NULL DEFAULT 0,
  total_core INTEGER NOT NULL DEFAULT 0,
  game_data_version TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_builds_public_updated ON saved_builds(visibility, updated_at DESC);
CREATE INDEX idx_builds_owner ON saved_builds(owner_id, updated_at DESC);

CREATE TABLE build_versions (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES saved_builds(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(build_id, version)
);
CREATE TABLE build_likes (build_id TEXT NOT NULL REFERENCES saved_builds(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(build_id, user_id));
CREATE TABLE build_favorites (build_id TEXT NOT NULL REFERENCES saved_builds(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(build_id, user_id));
CREATE TABLE build_copy_events (id TEXT PRIMARY KEY, build_id TEXT NOT NULL REFERENCES saved_builds(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reward_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE event_submissions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_fingerprint TEXT NOT NULL,
  mode TEXT NOT NULL,
  purpose TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deck_json TEXT NOT NULL,
  game_data_version TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'accepted' CHECK (review_state IN ('accepted', 'review', 'rejected')),
  created_at TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);

CREATE TABLE point_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_points_user_created ON point_ledger(user_id, created_at DESC);
CREATE TABLE point_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost >= 0), active INTEGER NOT NULL DEFAULT 1, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE point_redemptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, catalog_id TEXT NOT NULL REFERENCES point_catalog(id), cost INTEGER NOT NULL, ledger_id TEXT NOT NULL UNIQUE REFERENCES point_ledger(id), created_at TEXT NOT NULL);

CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('general', 'coop', 'crit', 'deck', 'tree', 'question')),
  description TEXT NOT NULL DEFAULT '',
  max_members INTEGER NOT NULL CHECK(max_members BETWEEN 2 AND 100),
  visibility TEXT NOT NULL CHECK(visibility IN ('public', 'unlisted')),
  join_requirement TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_rooms_category_updated ON chat_rooms(category, state, updated_at DESC);
CREATE TABLE chat_members (room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, room_role TEXT NOT NULL DEFAULT 'member' CHECK(room_role IN ('member', 'host', 'moderator')), muted_until TEXT, joined_at TEXT NOT NULL, left_at TEXT, PRIMARY KEY(room_id, user_id));
CREATE TABLE chat_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, client_nonce TEXT NOT NULL, reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL, body TEXT NOT NULL, moderation_state TEXT NOT NULL DEFAULT 'visible' CHECK(moderation_state IN ('visible', 'pending', 'hidden', 'deleted')), created_at TEXT NOT NULL, edited_at TEXT, UNIQUE(room_id, user_id, client_nonce));
CREATE INDEX idx_messages_room_created ON chat_messages(room_id, created_at DESC);
CREATE TABLE chat_reactions (message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reaction TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(message_id, user_id, reaction));

CREATE TABLE matchmaking_posts (id TEXT PRIMARY KEY, room_id TEXT REFERENCES chat_rooms(id) ON DELETE SET NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('coop', 'crit')), target TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('dealer', 'support', 'balanced')), looking_for TEXT NOT NULL CHECK(looking_for IN ('dealer', 'support', 'any')), deck_json TEXT NOT NULL, beginner_ok INTEGER NOT NULL DEFAULT 0, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 2 AND 8), current_members INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'full', 'expired', 'closed')), expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_matchmaking_open ON matchmaking_posts(kind, state, expires_at);

CREATE TABLE user_blocks (blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(blocker_id, blocked_id));
CREATE TABLE user_reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL, reason TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'reviewing', 'resolved', 'dismissed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_reports_state_created ON user_reports(state, created_at);
CREATE TABLE moderation_events (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL, rule_score REAL NOT NULL, ai_score REAL, categories_json TEXT NOT NULL, decision TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE user_sanctions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 7), reason TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_sanctions_user_active ON user_sanctions(user_id, active, ends_at);
CREATE TABLE appeals (id TEXT PRIMARY KEY, sanction_id TEXT NOT NULL REFERENCES user_sanctions(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, statement TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'upheld', 'reduced', 'reversed')), resolution TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE recommendation_events (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, segment_key TEXT NOT NULL, recommendation_json TEXT NOT NULL, algorithm_version TEXT NOT NULL, game_data_version TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE recommendation_feedback (id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL REFERENCES recommendation_events(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, outcome TEXT NOT NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), created_at TEXT NOT NULL, UNIQUE(recommendation_id, user_id));
CREATE TABLE community_deck_aggregates (segment_key TEXT NOT NULL, deck_fingerprint TEXT NOT NULL, sample_count INTEGER NOT NULL, weighted_count REAL NOT NULL, positive_count INTEGER NOT NULL, negative_count INTEGER NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL, game_data_version TEXT NOT NULL, algorithm_version TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(segment_key, deck_fingerprint, game_data_version, algorithm_version));

CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, payload_json TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at, created_at DESC);
CREATE TABLE admin_audit_logs (id TEXT PRIMARY KEY, admin_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL);

