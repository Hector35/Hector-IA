CREATE TABLE IF NOT EXISTS budget_quality_governance (
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','protect','probe','allow')),
  reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,task)
);

CREATE TABLE IF NOT EXISTS budget_quality_governance_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  previous_mode TEXT NOT NULL CHECK (previous_mode IN ('auto','protect','probe','allow')),
  next_mode TEXT NOT NULL CHECK (next_mode IN ('auto','protect','probe','allow')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_quality_governance_events_user_created
ON budget_quality_governance_events(user_id,created_at DESC);
