PRAGMA foreign_keys = ON;

ALTER TABLE external_access_tokens ADD COLUMN resource_path TEXT;

CREATE INDEX IF NOT EXISTS idx_external_access_tokens_resource
ON external_access_tokens(user_id,resource_path,revoked_at,expires_at);

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_lookup
ON mcp_oauth_codes(code_hash,consumed_at,expires_at);
