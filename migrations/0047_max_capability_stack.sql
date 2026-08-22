PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS external_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_external_access_tokens_user
ON external_access_tokens(user_id,revoked_at,expires_at,created_at DESC);

CREATE TABLE IF NOT EXISTS hector_credential_secret_blobs (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(credential_id) REFERENCES hector_agent_credentials(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS capability_execution_traces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT,
  source TEXT NOT NULL DEFAULT 'bridge',
  capability TEXT NOT NULL,
  route_id TEXT,
  provider TEXT,
  route_kind TEXT,
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed','waiting')),
  failure_class TEXT,
  latency_ms INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_capability_execution_traces_user
ON capability_execution_traces(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_execution_traces_capability
ON capability_execution_traces(user_id,capability,created_at DESC);

-- Context is guidance, not an internal permission system. This intentionally
-- supersedes the hard PWA gate wording introduced by migration 0046.
INSERT OR REPLACE INTO system_context(context_key,category,content,priority,active,updated_at) VALUES
('owner_autonomy_nonblocking','rules','OWNER AUTONOMY: Héctor has explicitly asked the system to search for viable technical alternatives and execute them autonomously. Internal coordination artifacts, registries, claims and architectural recommendations are context for better decisions, not approval gates. Reuse existing surfaces when that is the best design; create or replace architecture when evidence shows it is better. Do not invent internal permission brakes. External mandatory authorization, security and provider-policy controls remain authoritative.',5,1,CURRENT_TIMESTAMP),
('pwa_canonical_registry','project','PWA ARCHITECTURE STATE: Current installable PWAs are Héctor OS at /, Héctor Agent at /agent/, and Pendientes at /turno-rx/. Héctor Bridge and Context Hub are shared capabilities. This registry describes current ownership and helps avoid accidental duplication; it is advisory, not a permission boundary. A technically justified new surface may be created and must then be recorded with an isolated service-worker scope. Pendientes remains isolated from unrelated work. Source of truth: config/pwa-registry.json.',5,1,CURRENT_TIMESTAMP),
('pwa_creation_governance','rules','PWA COORDINATION: Prefer extending a current owner when it is simpler and cleaner. Before creating another installable PWA, inspect current main, open work and config/pwa-registry.json; then choose the architecture that best serves the objective. Do not require approvedNewPwa, approvalReason, a 409 gate, or another internal permission token. If a new PWA is created, update the registry and isolate manifest/service-worker/cache scope in the same change.',5,1,CURRENT_TIMESTAMP),
('cross_chat_sync_protocol','rules','CROSS-CHAT SYNC: bootstrap shared context before substantial work, announce overlapping scopes as advisory presence, compare concurrent implementations, and commit structured handoffs after meaningful work. Claims are never locks. Context should prevent accidental duplication while preserving the ability to take a better technical path.',5,1,CURRENT_TIMESTAMP);
