ALTER TABLE agent_experiences ADD COLUMN execution_id TEXT;
ALTER TABLE agent_experiences ADD COLUMN objective_normalized TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_experiences ADD COLUMN plan_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_experiences ADD COLUMN actions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_experiences ADD COLUMN tools_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_experiences ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_experiences ADD COLUMN error_text TEXT;
ALTER TABLE agent_experiences ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_experiences ADD COLUMN verification_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_experiences ADD COLUMN provider TEXT;
ALTER TABLE agent_experiences ADD COLUMN model TEXT;
ALTER TABLE agent_experiences ADD COLUMN input_tokens INTEGER;
ALTER TABLE agent_experiences ADD COLUMN cached_input_tokens INTEGER;
ALTER TABLE agent_experiences ADD COLUMN output_tokens INTEGER;
ALTER TABLE agent_experiences ADD COLUMN estimated_cost_usd REAL;
ALTER TABLE agent_experiences ADD COLUMN updated_at TEXT;

UPDATE agent_experiences
SET objective_normalized=lower(trim(objective)),
    execution_id=COALESCE(execution_id,job_id||':legacy'),
    verified=CASE WHEN status='completed' THEN 1 ELSE 0 END,
    updated_at=created_at
WHERE objective_normalized='';

CREATE INDEX IF NOT EXISTS idx_agent_experiences_user_objective
ON agent_experiences(user_id,objective_normalized,verified,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_experiences_execution
ON agent_experiences(user_id,execution_id)
WHERE execution_id IS NOT NULL;
