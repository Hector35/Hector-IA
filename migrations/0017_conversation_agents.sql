CREATE TABLE IF NOT EXISTS conversation_agents (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  trigger_mode TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_mode IN ('manual','automatic')),
  max_rounds INTEGER NOT NULL DEFAULT 2 CHECK(max_rounds BETWEEN 1 AND 6),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversation_agents_chat ON conversation_agents(conversation_id,enabled,created_at);

CREATE TABLE IF NOT EXISTS conversation_agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','paused','blocked','cancelled')),
  max_rounds INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  last_output TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversation_agent_runs_ready ON conversation_agent_runs(status,updated_at);
CREATE INDEX IF NOT EXISTS idx_conversation_agent_runs_chat ON conversation_agent_runs(conversation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_agent_turns (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  agent_id TEXT,
  speaker_name TEXT NOT NULL,
  speaker_type TEXT NOT NULL CHECK(speaker_type IN ('agent','principal')),
  round INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES conversation_agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id) REFERENCES conversation_agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_agent_turns_chat ON conversation_agent_turns(conversation_id,created_at,sequence);
