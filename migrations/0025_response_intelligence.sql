CREATE TABLE IF NOT EXISTS response_traces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  requested_provider TEXT NOT NULL CHECK (requested_provider IN ('cloudflare','openai')),
  actual_provider TEXT NOT NULL CHECK (actual_provider IN ('cloudflare','openai')),
  model TEXT NOT NULL,
  route_tier TEXT NOT NULL CHECK (route_tier IN ('fast','balanced','deep')),
  reasoning_level TEXT NOT NULL CHECK (reasoning_level IN ('low','medium','high')),
  task TEXT NOT NULL,
  model_reason TEXT NOT NULL,
  provider_reason TEXT NOT NULL,
  searched_web INTEGER NOT NULL DEFAULT 0 CHECK (searched_web IN (0,1)),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0,1)),
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  quality_accepted INTEGER NOT NULL DEFAULT 0 CHECK (quality_accepted IN (0,1)),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  estimated_cost_usd REAL NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  memories_json TEXT NOT NULL DEFAULT '[]',
  context_json TEXT NOT NULL DEFAULT '{}',
  recommendation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_response_traces_user_created
ON response_traces(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_traces_conversation_created
ON response_traces(user_id,conversation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS response_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1,1)),
  correction TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,trace_id),
  FOREIGN KEY(trace_id) REFERENCES response_traces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_response_feedback_user_updated
ON response_feedback(user_id,updated_at DESC);
