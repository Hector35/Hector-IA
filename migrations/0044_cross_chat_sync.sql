PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_sync_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  external_chat_ref TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT 'chatgpt',
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id,external_chat_ref)
);
CREATE INDEX IF NOT EXISTS idx_chat_sync_sessions_user_seen ON chat_sync_sessions(user_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS chat_sync_commits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  topic TEXT,
  summary TEXT NOT NULL,
  decisions_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  next_steps_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  resources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES chat_sync_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_sync_commits_user_created ON chat_sync_commits(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sync_commits_session_created ON chat_sync_commits(session_id,created_at DESC);

CREATE TABLE IF NOT EXISTS coordination_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  session_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
  lease_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES chat_sync_sessions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coordination_claim_active_scope ON coordination_claims(user_id,scope) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_coordination_claims_user_lease ON coordination_claims(user_id,status,lease_expires_at);

INSERT OR REPLACE INTO system_context(context_key,category,content,priority,active,updated_at) VALUES
('cross_chat_sync_protocol','rules','CROSS-CHAT SYNC PROTOCOL: all ChatGPT/Agent/Codex sessions that can reach Héctor Context Hub should bootstrap shared context before substantial work, claim the scope before parallel implementation, and commit a structured summary after meaningful work. The shared source of truth is durable state in D1/R2/GitHub, not any single chat transcript. A session must reuse active decisions, respect claims from other sessions, and publish decisions/actions/next steps/blockers so other sessions can continue without inventing parallel context.',5,1,CURRENT_TIMESTAMP);
