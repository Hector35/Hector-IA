CREATE TABLE IF NOT EXISTS inference_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  objective_normalized TEXT NOT NULL,
  text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  verification_json TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  expires_at TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,cache_key)
);
CREATE INDEX IF NOT EXISTS idx_inference_cache_lookup ON inference_cache(user_id,cache_key,verified,expires_at);
CREATE INDEX IF NOT EXISTS idx_inference_cache_objective ON inference_cache(user_id,objective_normalized,updated_at DESC);
CREATE TABLE IF NOT EXISTS inference_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  task_kind TEXT NOT NULL,
  route_tier TEXT NOT NULL,
  requested_provider TEXT NOT NULL,
  actual_provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_calls INTEGER NOT NULL DEFAULT 0,
  advanced_calls INTEGER NOT NULL DEFAULT 0,
  free_calls INTEGER NOT NULL DEFAULT 0,
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  estimated_cost_avoided_usd REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inference_events_user_time ON inference_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inference_events_route ON inference_events(user_id,task_kind,actual_provider,cache_hit,created_at DESC);
