CREATE TABLE assistant_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assistant_events_user_action ON assistant_events(user_id,action,created_at DESC);

CREATE TABLE learned_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,preference_key)
);
