CREATE TABLE IF NOT EXISTS agent_experiences (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_experiences_user_created ON agent_experiences(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_experiences_job ON agent_experiences(job_id);