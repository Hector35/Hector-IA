PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS context_hub_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_id TEXT UNIQUE,
  record_type TEXT NOT NULL CHECK (record_type IN ('fact','decision','project','task','preference','person','file','state','event')),
  subject TEXT,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  valid_from TEXT,
  valid_until TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','expired')),
  supersedes_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY(supersedes_id) REFERENCES context_hub_records(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_context_hub_records_user_current
ON context_hub_records(user_id,status,record_type,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_hub_records_source
ON context_hub_records(user_id,source_type,source_ref);

INSERT OR IGNORE INTO context_hub_records(
  id,user_id,memory_id,record_type,content,confidence,source_type,status,created_at,updated_at
)
SELECT
  id,user_id,id,
  CASE kind
    WHEN 'decision' THEN 'decision'
    WHEN 'project' THEN 'project'
    WHEN 'preference' THEN 'preference'
    WHEN 'error' THEN 'event'
    ELSE 'fact'
  END,
  content,0.8,source,'active',created_at,updated_at
FROM memories;

CREATE TABLE IF NOT EXISTS context_hub_tools (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  handler_type TEXT NOT NULL CHECK (handler_type IN ('http_same_origin','github_workflow','resilience_route')),
  endpoint_ref TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST' CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  priority INTEGER NOT NULL DEFAULT 100,
  risk TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high')),
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id,capability,endpoint_ref)
);
CREATE INDEX IF NOT EXISTS idx_context_hub_tools_capability
ON context_hub_tools(user_id,capability,enabled,priority,updated_at DESC);

CREATE TABLE IF NOT EXISTS context_hub_tool_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_id TEXT,
  capability TEXT NOT NULL,
  handler_type TEXT NOT NULL,
  endpoint_ref TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  risk TEXT NOT NULL DEFAULT 'low',
  requires_approval INTEGER NOT NULL DEFAULT 0,
  input_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','waiting_approval','working','completed','failed','cancelled')),
  approval_id TEXT,
  result_json TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tool_id) REFERENCES context_hub_tools(id) ON DELETE SET NULL,
  FOREIGN KEY(approval_id) REFERENCES hector_agent_approvals(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_context_hub_tool_runs_user_status
ON context_hub_tool_runs(user_id,status,updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_context_hub_tool_approval_resume
AFTER UPDATE OF status ON hector_agent_approvals
WHEN OLD.status='pending' AND NEW.status='approved'
BEGIN
  UPDATE context_hub_tool_runs
  SET status='queued',updated_at=CURRENT_TIMESTAMP
  WHERE approval_id=NEW.id AND status='waiting_approval';
END;

CREATE TRIGGER IF NOT EXISTS trg_context_hub_tool_approval_cancel
AFTER UPDATE OF status ON hector_agent_approvals
WHEN OLD.status='pending' AND NEW.status='rejected'
BEGIN
  UPDATE context_hub_tool_runs
  SET status='cancelled',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE approval_id=NEW.id AND status='waiting_approval';
END;
