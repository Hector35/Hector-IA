CREATE TABLE IF NOT EXISTS metacognitive_calibration_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  route_tier TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  predicted_confidence REAL NOT NULL CHECK(predicted_confidence>=0 AND predicted_confidence<=1),
  correct INTEGER NOT NULL CHECK(correct IN (0,1)),
  verification_ok INTEGER NOT NULL CHECK(verification_ok IN (0,1)),
  quality_accepted INTEGER NOT NULL CHECK(quality_accepted IN (0,1)),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK(fallback IN (0,1)),
  brier_score REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metacognitive_calibration_user_task
  ON metacognitive_calibration_events(user_id,task,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metacognitive_calibration_route
  ON metacognitive_calibration_events(user_id,route_tier,provider,created_at DESC);