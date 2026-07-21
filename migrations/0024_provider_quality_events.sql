CREATE TABLE IF NOT EXISTS provider_quality_events (
  id TEXT PRIMARY KEY,
  requested_provider TEXT NOT NULL CHECK (requested_provider IN ('cloudflare','openai')),
  actual_provider TEXT NOT NULL CHECK (actual_provider IN ('cloudflare','openai')),
  model TEXT NOT NULL,
  route_tier TEXT NOT NULL CHECK (route_tier IN ('fast','balanced','deep')),
  task TEXT NOT NULL,
  accepted INTEGER NOT NULL CHECK (accepted IN (0,1)),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  fallback INTEGER NOT NULL CHECK (fallback IN (0,1)),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_quality_requested_created
ON provider_quality_events(requested_provider,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_quality_actual_created
ON provider_quality_events(actual_provider,created_at DESC);
