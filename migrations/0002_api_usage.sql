CREATE TABLE api_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  model TEXT,
  input_units INTEGER NOT NULL DEFAULT 0,
  cached_input_units INTEGER NOT NULL DEFAULT 0,
  output_units INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'tokens',
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_api_usage_user_date ON api_usage(user_id,created_at DESC);
