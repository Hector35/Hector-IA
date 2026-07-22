CREATE TABLE IF NOT EXISTS call_governor_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  reuse_kind TEXT NOT NULL,
  cache_status TEXT NOT NULL,
  inference_tier TEXT NOT NULL,
  original_planned_passes INTEGER NOT NULL DEFAULT 0,
  governed_planned_passes INTEGER NOT NULL DEFAULT 0,
  total_inference_passes INTEGER NOT NULL DEFAULT 0,
  free_inference_passes INTEGER NOT NULL DEFAULT 0,
  economy_inference_passes INTEGER NOT NULL DEFAULT 0,
  advanced_inference_passes INTEGER NOT NULL DEFAULT 0,
  calls_avoided INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  justification TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_governor_events_user_created
  ON call_governor_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_governor_events_request
  ON call_governor_events(user_id, request_key, created_at DESC);
