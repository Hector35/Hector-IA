ALTER TABLE work_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE work_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE work_jobs ADD COLUMN next_retry_at TEXT;
ALTER TABLE work_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE work_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE work_jobs ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_work_jobs_claim
ON work_jobs(status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_work_jobs_lease
ON work_jobs(status, lease_expires_at);
