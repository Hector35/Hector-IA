CREATE TABLE IF NOT EXISTS conversation_aliases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, alias),
  UNIQUE(user_id, conversation_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversation_aliases_user ON conversation_aliases(user_id, alias);

CREATE TABLE IF NOT EXISTS conversation_delegations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  target_conversation_id TEXT NOT NULL,
  target_label TEXT NOT NULL,
  objective TEXT NOT NULL,
  current_instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  current_iteration INTEGER NOT NULL DEFAULT 0,
  max_iterations INTEGER NOT NULL DEFAULT 3,
  stop_on_success INTEGER NOT NULL DEFAULT 1,
  last_report TEXT,
  last_review TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(target_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_delegations_user_status ON conversation_delegations(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_source ON conversation_delegations(source_conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_target ON conversation_delegations(target_conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_delegation_turns (
  id TEXT PRIMARY KEY,
  delegation_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(delegation_id) REFERENCES conversation_delegations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_delegation_turns_order ON conversation_delegation_turns(delegation_id, iteration, created_at);
