CREATE TABLE IF NOT EXISTS browser_verification_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  viewport TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  run_id TEXT,
  evidence_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES work_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES browser_evidence(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_verification_job_created
ON browser_verification_runs(job_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_verification_status_updated
ON browser_verification_runs(status,updated_at);
