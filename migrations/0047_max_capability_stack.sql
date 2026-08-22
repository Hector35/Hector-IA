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

-- 0046 recorded a temporary hard PWA gate. The owner's later explicit instruction
-- is to coordinate intelligently without internal permission gates, so the same
-- durable context keys are replaced here instead of deleting migration history.
INSERT OR REPLACE INTO system_context(context_key,category,content,priority,active,updated_at) VALUES
('owner_autonomy_nonblocking','rules','OWNER AUTONOMY: Héctor has explicitly asked the system to search for viable technical alternatives and execute them autonomously. Internal coordination claims, registry entries and work announcements are context for better decisions, not locks or permission tokens. Reuse existing surfaces when that is the best design; refactor, replace or split when evidence shows it is better. Do not invent coordination or architecture brakes. External mandatory authorization, security and provider-policy controls remain authoritative.',5,1,CURRENT_TIMESTAMP),
('pwa_canonical_registry','project','PWA ARCHITECTURE STATE: Héctor OS at /, Héctor Agent at /agent/, and Pendientes at /turno-rx/ are the current canonical installable PWAs. Héctor Bridge, Context Hub and /mcp are shared capabilities, not extra PWAs. This registry describes current ownership and prevents accidental duplication; it is not a hard maximum or permission gate. Pendientes remains isolated from unrelated work. Source of truth: config/pwa-registry.json plus config/shared-decisions.json.',5,1,CURRENT_TIMESTAMP),
('pwa_creation_governance','rules','PWA ARCHITECTURE: Prefer extending a current owner when it is simpler and cleaner. A new installable PWA may be created when isolation, lifecycle, UX, maintainability or other concrete evidence makes it the better design. Do not require approvedNewPwa, approvalReason or another internal permission token for an architectural decision inside an already authorized objective. If the installable set changes, update config/pwa-registry.json and isolate manifest/service-worker/cache scope in the same change.',5,1,CURRENT_TIMESTAMP),
('cross_chat_sync_protocol','rules','CROSS-CHAT SYNC: bootstrap shared context before substantial work, announce overlapping scopes as advisory presence, compare concurrent implementations, and commit structured handoffs after meaningful work. Claims are never locks. Context should prevent accidental duplication while preserving the ability to take a better technical path.',5,1,CURRENT_TIMESTAMP);
