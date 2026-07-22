CREATE TABLE IF NOT EXISTS budget_quality_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','resolved')),
  reason TEXT NOT NULL,
  triggers_json TEXT NOT NULL DEFAULT '[]',
  sample_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  muted_until TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, task),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budget_quality_alerts_user_state
  ON budget_quality_alerts(user_id, state, updated_at DESC);
