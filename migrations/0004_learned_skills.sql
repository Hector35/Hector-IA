CREATE TABLE learned_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_text TEXT NOT NULL,
  learned_response TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'openai',
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,request_key)
);
CREATE INDEX idx_learned_skills_user_key ON learned_skills(user_id,request_key,expires_at);
