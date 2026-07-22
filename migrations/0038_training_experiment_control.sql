CREATE TABLE IF NOT EXISTS training_capability_leases (
  capability_key TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  owner_slot TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  benchmark_key TEXT NOT NULL,
  files_json TEXT NOT NULL DEFAULT '[]',
  cost_limit_usd REAL NOT NULL DEFAULT 0 CHECK(cost_limit_usd>=0),
  status TEXT NOT NULL CHECK(status IN ('active','completed','failed','released')),
  acquired_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_leases_owner
  ON training_capability_leases(owner_slot,status,lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_training_leases_expiry
  ON training_capability_leases(status,lease_expires_at);

CREATE TABLE IF NOT EXISTS training_experiment_runs (
  id TEXT PRIMARY KEY,
  capability_key TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  owner_slot TEXT NOT NULL,
  benchmark_key TEXT NOT NULL,
  baseline_score REAL NOT NULL,
  candidate_score REAL NOT NULL,
  holdout_score REAL NOT NULL,
  transfer_score REAL NOT NULL,
  regression_score REAL NOT NULL,
  advanced_calls INTEGER NOT NULL DEFAULT 0 CHECK(advanced_calls>=0),
  tokens INTEGER NOT NULL DEFAULT 0 CHECK(tokens>=0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK(cost_usd>=0),
  promoted INTEGER NOT NULL CHECK(promoted IN (0,1)),
  outcome TEXT NOT NULL CHECK(outcome IN ('promoted','rejected','rolled_back','failed')),
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  failure_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_runs_capability
  ON training_experiment_runs(capability_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_runs_benchmark
  ON training_experiment_runs(benchmark_key,created_at DESC);
