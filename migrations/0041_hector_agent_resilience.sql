CREATE TABLE IF NOT EXISTS hector_agent_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth','service_account','api_token','github_app','connector','none')),
  secret_ref TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','refresh_required','expired','revoked','blocked')),
  refreshable INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  last_verified_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_credentials_user_provider
ON hector_agent_credentials(user_id,provider,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS hector_agent_capability_routes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider TEXT NOT NULL,
  route_kind TEXT NOT NULL CHECK (route_kind IN ('connector','api','github_action','worker','mcp','model','deterministic')),
  endpoint_ref TEXT,
  credential_id TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  risk TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_error TEXT,
  last_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(credential_id) REFERENCES hector_agent_credentials(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_routes_capability
ON hector_agent_capability_routes(user_id,capability,enabled,priority,failure_count);

CREATE TABLE IF NOT EXISTS hector_agent_resume_checkpoints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  work_job_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','waiting_external','waiting_approval','resumed','completed','cancelled')),
  resume_after TEXT,
  approval_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resumed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(goal_id) REFERENCES hector_agent_goals(id) ON DELETE CASCADE,
  FOREIGN KEY(work_job_id) REFERENCES work_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(approval_id) REFERENCES hector_agent_approvals(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hector_agent_checkpoints_resume
ON hector_agent_resume_checkpoints(user_id,status,resume_after,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hector_agent_checkpoints_goal
ON hector_agent_resume_checkpoints(goal_id,updated_at DESC);
