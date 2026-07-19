CREATE TABLE IF NOT EXISTS agent_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_id TEXT,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  execution_mode TEXT NOT NULL CHECK(execution_mode IN ('series','parallel')),
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  director_conversation_id TEXT,
  final_report TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(director_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_projects_user_updated ON agent_projects(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_projects_status ON agent_projects(status,updated_at);

CREATE TABLE IF NOT EXISTS agent_project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  agent_conversation_id TEXT,
  result TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES agent_projects(id) ON DELETE CASCADE,
  FOREIGN KEY(agent_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  UNIQUE(project_id,position)
);
CREATE INDEX IF NOT EXISTS idx_agent_project_tasks_ready ON agent_project_tasks(project_id,status,position);

CREATE TABLE IF NOT EXISTS agent_project_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  PRIMARY KEY(task_id,depends_on_task_id),
  FOREIGN KEY(task_id) REFERENCES agent_project_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_task_id) REFERENCES agent_project_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES agent_projects(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES agent_project_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_project_events_order ON agent_project_events(project_id,created_at);
