CREATE TABLE IF NOT EXISTS agent_retrieval_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('experience','skill','document','result')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  evidence_verified INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.65,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,kind,source_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_retrieval_items_user_kind
ON agent_retrieval_items(user_id,kind,evidence_verified,updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS agent_retrieval_fts USING fts5(
  item_id UNINDEXED,
  user_id UNINDEXED,
  title,
  content,
  tags,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS agent_retrieval_meta (
  user_id TEXT PRIMARY KEY,
  corpus_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_retrieval_cache (
  user_id TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  corpus_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,query_hash,corpus_version)
);

CREATE INDEX IF NOT EXISTS idx_agent_retrieval_cache_expiry
ON agent_retrieval_cache(expires_at);

CREATE TRIGGER IF NOT EXISTS agent_retrieval_items_ai
AFTER INSERT ON agent_retrieval_items
BEGIN
  INSERT INTO agent_retrieval_fts(rowid,item_id,user_id,title,content,tags)
  VALUES(NEW.rowid,NEW.id,NEW.user_id,NEW.title,NEW.content,NEW.tags_json);
  INSERT INTO agent_retrieval_meta(user_id,corpus_version,updated_at)
  VALUES(NEW.user_id,1,CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET corpus_version=agent_retrieval_meta.corpus_version+1,updated_at=CURRENT_TIMESTAMP;
  DELETE FROM agent_retrieval_cache WHERE user_id=NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS agent_retrieval_items_au
AFTER UPDATE ON agent_retrieval_items
BEGIN
  DELETE FROM agent_retrieval_fts WHERE rowid=OLD.rowid;
  INSERT INTO agent_retrieval_fts(rowid,item_id,user_id,title,content,tags)
  VALUES(NEW.rowid,NEW.id,NEW.user_id,NEW.title,NEW.content,NEW.tags_json);
  INSERT INTO agent_retrieval_meta(user_id,corpus_version,updated_at)
  VALUES(NEW.user_id,1,CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET corpus_version=agent_retrieval_meta.corpus_version+1,updated_at=CURRENT_TIMESTAMP;
  DELETE FROM agent_retrieval_cache WHERE user_id IN (OLD.user_id,NEW.user_id);
END;

CREATE TRIGGER IF NOT EXISTS agent_retrieval_items_ad
AFTER DELETE ON agent_retrieval_items
BEGIN
  DELETE FROM agent_retrieval_fts WHERE rowid=OLD.rowid;
  INSERT INTO agent_retrieval_meta(user_id,corpus_version,updated_at)
  VALUES(OLD.user_id,1,CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET corpus_version=agent_retrieval_meta.corpus_version+1,updated_at=CURRENT_TIMESTAMP;
  DELETE FROM agent_retrieval_cache WHERE user_id=OLD.user_id;
END;

INSERT OR IGNORE INTO agent_retrieval_items(
  id,user_id,kind,source_id,title,content,tags_json,evidence_verified,success_rate,estimated_cost_usd,created_at,updated_at
)
SELECT
  'experience:'||id,
  user_id,
  'experience',
  id,
  objective,
  result,
  COALESCE(skills_json,'[]'),
  1,
  MAX(0.55,MIN(0.95,0.94-(MAX(1,attempts)-1)*0.055)),
  COALESCE(estimated_cost_usd,0),
  created_at,
  COALESCE(updated_at,created_at)
FROM agent_experiences
WHERE status='completed'
  AND verified=1
  AND result IS NOT NULL
  AND length(trim(result))>=20
  AND (evidence_json LIKE '%"verified":true%' OR evidence_json LIKE '%"verified": true%');

CREATE TRIGGER IF NOT EXISTS agent_experiences_retrieval_ai
AFTER INSERT ON agent_experiences
WHEN NEW.status='completed'
 AND NEW.verified=1
 AND NEW.result IS NOT NULL
 AND length(trim(NEW.result))>=20
 AND (NEW.evidence_json LIKE '%"verified":true%' OR NEW.evidence_json LIKE '%"verified": true%')
BEGIN
  INSERT INTO agent_retrieval_items(id,user_id,kind,source_id,title,content,tags_json,evidence_verified,success_rate,estimated_cost_usd,created_at,updated_at)
  VALUES('experience:'||NEW.id,NEW.user_id,'experience',NEW.id,NEW.objective,NEW.result,COALESCE(NEW.skills_json,'[]'),1,MAX(0.55,MIN(0.95,0.94-(MAX(1,NEW.attempts)-1)*0.055)),COALESCE(NEW.estimated_cost_usd,0),NEW.created_at,COALESCE(NEW.updated_at,NEW.created_at))
  ON CONFLICT(user_id,kind,source_id) DO UPDATE SET title=excluded.title,content=excluded.content,tags_json=excluded.tags_json,evidence_verified=1,success_rate=excluded.success_rate,estimated_cost_usd=excluded.estimated_cost_usd,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS agent_experiences_retrieval_au_valid
AFTER UPDATE ON agent_experiences
WHEN NEW.status='completed'
 AND NEW.verified=1
 AND NEW.result IS NOT NULL
 AND length(trim(NEW.result))>=20
 AND (NEW.evidence_json LIKE '%"verified":true%' OR NEW.evidence_json LIKE '%"verified": true%')
BEGIN
  INSERT INTO agent_retrieval_items(id,user_id,kind,source_id,title,content,tags_json,evidence_verified,success_rate,estimated_cost_usd,created_at,updated_at)
  VALUES('experience:'||NEW.id,NEW.user_id,'experience',NEW.id,NEW.objective,NEW.result,COALESCE(NEW.skills_json,'[]'),1,MAX(0.55,MIN(0.95,0.94-(MAX(1,NEW.attempts)-1)*0.055)),COALESCE(NEW.estimated_cost_usd,0),NEW.created_at,COALESCE(NEW.updated_at,NEW.created_at))
  ON CONFLICT(user_id,kind,source_id) DO UPDATE SET title=excluded.title,content=excluded.content,tags_json=excluded.tags_json,evidence_verified=1,success_rate=excluded.success_rate,estimated_cost_usd=excluded.estimated_cost_usd,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS agent_experiences_retrieval_au_invalid
AFTER UPDATE ON agent_experiences
WHEN NEW.status!='completed'
 OR NEW.verified!=1
 OR NEW.result IS NULL
 OR length(trim(COALESCE(NEW.result,'')))<20
 OR NOT (NEW.evidence_json LIKE '%"verified":true%' OR NEW.evidence_json LIKE '%"verified": true%')
BEGIN
  DELETE FROM agent_retrieval_items WHERE user_id=OLD.user_id AND kind='experience' AND source_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS agent_experiences_retrieval_ad
AFTER DELETE ON agent_experiences
BEGIN
  DELETE FROM agent_retrieval_items WHERE user_id=OLD.user_id AND kind='experience' AND source_id=OLD.id;
END;
