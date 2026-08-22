CREATE TABLE IF NOT EXISTS hector_agent_settings (
  user_id TEXT PRIMARY KEY,
  autonomy_mode TEXT NOT NULL DEFAULT 'supervised' CHECK (autonomy_mode IN ('manual','supervised','autonomous')),
  paused INTEGER NOT NULL DEFAULT 0,
  auto_enabled INTEGER NOT NULL DEFAULT 1,
  max_iterations INTEGER NOT NULL DEFAULT 20,
  max_runtime_seconds INTEGER NOT NULL DEFAULT 1800,
  max_cost_usd REAL NOT NULL DEFAULT 1.00,
  max_consecutive_errors INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hector_agent_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  work_job_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(work_job_id) REFERENCES work_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_goals_user_updated ON hector_agent_goals(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS hector_agent_approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  resources_json TEXT NOT NULL DEFAULT '[]',
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  expected_result TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(goal_id) REFERENCES hector_agent_goals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_approvals_user_status ON hector_agent_approvals(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS hector_agent_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fact','decision','preference','project','error','solution')),
  content TEXT NOT NULL,
  source_goal_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(source_goal_id) REFERENCES hector_agent_goals(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_memory_user_updated ON hector_agent_memory(user_id,updated_at DESC);
