CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('research','learning','programming','automation','agent','api','skill','update')),
  cadence TEXT NOT NULL CHECK (cadence IN ('once','hourly','every_2_hours','every_6_hours','daily','weekly')),
  interval_minutes INTEGER,
  reasoning_level TEXT NOT NULL DEFAULT 'high' CHECK (reasoning_level IN ('standard','high')),
  autonomy_mode TEXT NOT NULL DEFAULT 'independent' CHECK (autonomy_mode IN ('guided','independent','continuous')),
  allow_web INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_job_id TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(enabled,next_run_at,lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id,updated_at DESC);
ALTER TABLE work_jobs ADD COLUMN schedule_id TEXT;
ALTER TABLE work_jobs ADD COLUMN reasoning_level TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE work_jobs ADD COLUMN autonomy_mode TEXT NOT NULL DEFAULT 'guided';
ALTER TABLE work_jobs ADD COLUMN allow_web INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_work_jobs_schedule ON work_jobs(schedule_id,created_at DESC);
