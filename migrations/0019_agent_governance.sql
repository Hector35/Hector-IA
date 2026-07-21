ALTER TABLE agent_projects ADD COLUMN objective_hash TEXT;
ALTER TABLE agent_projects ADD COLUMN max_agents INTEGER NOT NULL DEFAULT 5;
ALTER TABLE agent_projects ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 2;
ALTER TABLE agent_projects ADD COLUMN max_runtime_seconds INTEGER NOT NULL DEFAULT 240;
ALTER TABLE agent_project_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_project_tasks ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 2;
CREATE INDEX IF NOT EXISTS idx_agent_projects_objective_hash ON agent_projects(user_id,objective_hash,status);
CREATE INDEX IF NOT EXISTS idx_agent_project_tasks_status ON agent_project_tasks(project_id,status,position);