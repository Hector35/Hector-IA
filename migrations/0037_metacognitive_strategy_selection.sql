CREATE TABLE IF NOT EXISTS metacognitive_strategy_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  route_tier TEXT NOT NULL CHECK (route_tier IN ('fast','balanced','deep')),
  requested_provider TEXT NOT NULL CHECK (requested_provider IN ('cloudflare','openai')),
  actual_provider TEXT NOT NULL CHECK (actual_provider IN ('cloudflare','openai')),
  cognitive_mode TEXT NOT NULL CHECK (cognitive_mode IN ('single','ensemble')),
  success INTEGER NOT NULL CHECK (success IN (0,1)),
  verification_ok INTEGER NOT NULL CHECK (verification_ok IN (0,1)),
  quality_accepted INTEGER NOT NULL CHECK (quality_accepted IN (0,1)),
  fallback INTEGER NOT NULL CHECK (fallback IN (0,1)),
  advanced_calls INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meta_strategy_user_task
  ON metacognitive_strategy_outcomes(user_id,task,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_strategy_user_key
  ON metacognitive_strategy_outcomes(user_id,strategy_key,created_at DESC);
