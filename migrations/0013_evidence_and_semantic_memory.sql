CREATE TABLE IF NOT EXISTS browser_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  job_id TEXT,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  http_status INTEGER,
  errors_json TEXT NOT NULL DEFAULT '[]',
  report_key TEXT,
  screenshot_key TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_browser_evidence_job_created ON browser_evidence(job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_evidence_user_created ON browser_evidence(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user ON memory_embeddings(user_id);
