CREATE TABLE learned_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  trigger_text TEXT NOT NULL,
  procedure_text TEXT NOT NULL,
  skills_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','degraded','disabled')),
  confidence REAL NOT NULL DEFAULT 0.40 CHECK (confidence BETWEEN 0 AND 1),
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  active_version INTEGER NOT NULL DEFAULT 1,
  last_experience_id TEXT,
  disabled_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,fingerprint),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (last_experience_id) REFERENCES agent_experiences(id) ON DELETE SET NULL
);

CREATE TABLE learned_skill_versions (
  id TEXT PRIMARY KEY,
  learned_skill_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  trigger_text TEXT NOT NULL,
  procedure_text TEXT NOT NULL,
  skills_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_experience_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(learned_skill_id,version),
  FOREIGN KEY (learned_skill_id) REFERENCES learned_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (source_experience_id) REFERENCES agent_experiences(id) ON DELETE SET NULL
);

CREATE TABLE learned_skill_events (
  id TEXT PRIMARY KEY,
  learned_skill_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('candidate_created','candidate_reinforced','promoted','failed','degraded','disabled','rolled_back')),
  from_status TEXT,
  to_status TEXT,
  confidence REAL NOT NULL,
  experience_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learned_skill_id) REFERENCES learned_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (experience_id) REFERENCES agent_experiences(id) ON DELETE SET NULL
);

CREATE INDEX idx_learned_skills_user_status ON learned_skills(user_id,status,confidence DESC,updated_at DESC);
CREATE INDEX idx_learned_skill_events_skill ON learned_skill_events(learned_skill_id,created_at DESC);
CREATE INDEX idx_learned_skill_versions_skill ON learned_skill_versions(learned_skill_id,version DESC);
