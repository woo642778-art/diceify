-- User-created guild directory. Popularity uses authenticated Diceify actions only.
CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  guild_code TEXT NOT NULL,
  recruiting INTEGER NOT NULL DEFAULT 1 CHECK(recruiting IN (0,1)),
  active_hours TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  contact TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'published' CHECK(state IN ('published','hidden','removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id),
  UNIQUE(normalized_name)
);

CREATE TABLE guild_signals (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('save','inquiry')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(guild_id,user_id,kind)
);

CREATE INDEX idx_guild_directory ON guilds(state,recruiting,updated_at DESC);
CREATE INDEX idx_guild_signals ON guild_signals(guild_id,kind);
