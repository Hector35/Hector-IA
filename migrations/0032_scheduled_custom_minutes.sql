CREATE TABLE scheduled_tasks_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('research','learning','programming','automation','agent','api','skill','update')),
  cadence TEXT NOT NULL CHECK (cadence IN ('once','custom_minutes','hourly','every_2_hours','every_6_hours','daily','weekly')),
  interval_minutes INTEGER CHECK (interval_minutes IS NULL OR (interval_minutes BETWEEN 1 AND 10080)),
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

INSERT INTO scheduled_tasks_next (
  id,user_id,title,prompt,kind,cadence,interval_minutes,reasoning_level,autonomy_mode,
  allow_web,enabled,next_run_at,last_run_at,last_job_id,run_count,failure_count,
  skipped_count,lease_token,lease_expires_at,created_at,updated_at
)
SELECT
  id,user_id,title,prompt,kind,cadence,interval_minutes,reasoning_level,autonomy_mode,
  allow_web,enabled,next_run_at,last_run_at,last_job_id,run_count,failure_count,
  skipped_count,lease_token,lease_expires_at,created_at,updated_at
FROM scheduled_tasks;

DROP TABLE scheduled_tasks;
ALTER TABLE scheduled_tasks_next RENAME TO scheduled_tasks;

CREATE INDEX idx_scheduled_tasks_due ON scheduled_tasks(enabled,next_run_at,lease_expires_at);
CREATE INDEX idx_scheduled_tasks_user ON scheduled_tasks(user_id,updated_at DESC);
