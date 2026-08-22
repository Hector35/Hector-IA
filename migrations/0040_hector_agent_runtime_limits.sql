ALTER TABLE hector_agent_goals ADD COLUMN accumulated_runtime_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hector_agent_goals ADD COLUMN accumulated_cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE hector_agent_goals ADD COLUMN consecutive_errors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hector_agent_goals ADD COLUMN stop_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_hector_agent_goals_work_job
ON hector_agent_goals(work_job_id);
