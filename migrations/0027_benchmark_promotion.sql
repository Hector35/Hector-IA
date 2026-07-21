CREATE TABLE IF NOT EXISTS intelligence_benchmark_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  category TEXT NOT NULL,
  baseline_score INTEGER NOT NULL CHECK(baseline_score >= 0),
  adaptive_score INTEGER NOT NULL CHECK(adaptive_score >= 0),
  winner TEXT NOT NULL CHECK(winner IN ('baseline','adaptive','tie')),
  baseline_cost_usd REAL NOT NULL CHECK(baseline_cost_usd >= 0),
  adaptive_cost_usd REAL NOT NULL CHECK(adaptive_cost_usd >= 0),
  baseline_latency_ms INTEGER NOT NULL CHECK(baseline_latency_ms >= 0),
  adaptive_latency_ms INTEGER NOT NULL CHECK(adaptive_latency_ms >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,run_id,case_id)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_results_user_category_created
ON intelligence_benchmark_results(user_id,category,created_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_strategy_policies (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'baseline' CHECK(strategy IN ('baseline','adaptive')),
  status TEXT NOT NULL DEFAULT 'observing' CHECK(status IN ('observing','promoted','rolled_back')),
  sample_count INTEGER NOT NULL DEFAULT 0,
  adaptive_win_rate REAL NOT NULL DEFAULT 0 CHECK(adaptive_win_rate BETWEEN 0 AND 1),
  average_score_delta REAL NOT NULL DEFAULT 0,
  average_cost_multiplier REAL NOT NULL DEFAULT 1 CHECK(average_cost_multiplier >= 0),
  reason TEXT NOT NULL,
  promoted_at TEXT,
  rolled_back_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,category)
);
