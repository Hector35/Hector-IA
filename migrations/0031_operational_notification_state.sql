CREATE TABLE IF NOT EXISTS operational_notification_state (
  user_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  acknowledged_at TEXT,
  muted_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,event_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operational_notification_state_user_updated
ON operational_notification_state(user_id,updated_at DESC);
