ALTER TABLE intelligence_strategy_policies ADD COLUMN governance_mode TEXT NOT NULL DEFAULT 'auto' CHECK(governance_mode IN ('auto','frozen','excluded'));
ALTER TABLE intelligence_strategy_policies ADD COLUMN governance_reason TEXT;
ALTER TABLE intelligence_strategy_policies ADD COLUMN governance_updated_at TEXT;

CREATE TABLE IF NOT EXISTS intelligence_strategy_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('freeze','unfreeze','exclude','include','manual_rollback','auto_promote','auto_rollback')),
  strategy TEXT NOT NULL CHECK(strategy IN ('baseline','adaptive')),
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strategy_events_user_created
ON intelligence_strategy_events(user_id,created_at DESC);
