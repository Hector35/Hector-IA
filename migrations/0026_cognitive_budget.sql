CREATE TABLE IF NOT EXISTS cognitive_budgets (
  user_id TEXT PRIMARY KEY,
  daily_limit_usd REAL NOT NULL DEFAULT 1.00 CHECK(daily_limit_usd >= 0),
  monthly_limit_usd REAL NOT NULL DEFAULT 20.00 CHECK(monthly_limit_usd >= 0),
  warn_percent INTEGER NOT NULL DEFAULT 80 CHECK(warn_percent BETWEEN 1 AND 100),
  enforcement_mode TEXT NOT NULL DEFAULT 'observe' CHECK(enforcement_mode IN ('observe','protect')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_created_cost
ON api_usage(user_id, created_at, estimated_cost_usd);
