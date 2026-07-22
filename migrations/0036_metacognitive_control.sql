CREATE TABLE IF NOT EXISTS metacognitive_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  planned_strategy_key TEXT NOT NULL,
  route_tier TEXT NOT NULL CHECK (route_tier IN ('fast','balanced','deep')),
  provider TEXT NOT NULL CHECK (provider IN ('cloudflare','openai')),
  cognitive_mode TEXT NOT NULL CHECK (cognitive_mode IN ('single','ensemble')),
  predicted_success REAL NOT NULL CHECK (predicted_success >= 0 AND predicted_success <= 1),
  observed_success INTEGER NOT NULL CHECK (observed_success IN (0,1)),
  verification_ok INTEGER NOT NULL CHECK (verification_ok IN (0,1)),
  quality_score REAL NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0,1)),
  advanced_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL CHECK (action IN ('monitor','conserve','escalate','verify')),
  decision_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metacognitive_user_task_time
  ON metacognitive_outcomes(user_id,task,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metacognitive_user_strategy_time
  ON metacognitive_outcomes(user_id,strategy_key,created_at DESC);
