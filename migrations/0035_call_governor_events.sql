CREATE TABLE IF NOT EXISTS call_governor_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  advanced_calls INTEGER NOT NULL DEFAULT 0,
  deduplicated_calls INTEGER NOT NULL DEFAULT 0,
  semantic_cache_hits INTEGER NOT NULL DEFAULT 0,
  blocked_calls INTEGER NOT NULL DEFAULT 0,
  requested_passes INTEGER NOT NULL DEFAULT 0,
  executed_passes INTEGER NOT NULL DEFAULT 0,
  estimated_calls_saved INTEGER NOT NULL DEFAULT 0,
  justifications_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_governor_events_user_created
  ON call_governor_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_governor_events_request
  ON call_governor_events(user_id, request_key, created_at DESC);
