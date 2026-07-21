ALTER TABLE messages ADD COLUMN provider TEXT;
ALTER TABLE messages ADD COLUMN model TEXT;
ALTER TABLE messages ADD COLUMN model_tier TEXT;
ALTER TABLE messages ADD COLUMN task TEXT;

CREATE TABLE IF NOT EXISTS response_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1,1)),
  reason TEXT CHECK (reason IN ('incorrect','incomplete','not_personalized','too_long','too_short','unsafe','other')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_tier TEXT NOT NULL CHECK (model_tier IN ('fast','balanced','deep','verified')),
  task TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,message_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_response_feedback_user_task_created
ON response_feedback(user_id,task,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_feedback_user_provider_created
ON response_feedback(user_id,provider,created_at DESC);
