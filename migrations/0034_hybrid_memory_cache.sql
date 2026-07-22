CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('experience','skill','document','result','rule')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  success_rate REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_items_user_verified_updated
  ON memory_items(user_id, verified, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_items_user_source
  ON memory_items(user_id, source_type, source_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
  item_id UNINDEXED,
  user_id UNINDEXED,
  title,
  normalized_text,
  tags,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS memory_items_ai AFTER INSERT ON memory_items BEGIN
  INSERT INTO memory_items_fts(item_id,user_id,title,normalized_text,tags)
  VALUES(new.id,new.user_id,new.title,new.normalized_text,new.tags_json);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_au AFTER UPDATE ON memory_items BEGIN
  DELETE FROM memory_items_fts WHERE item_id=old.id;
  INSERT INTO memory_items_fts(item_id,user_id,title,normalized_text,tags)
  VALUES(new.id,new.user_id,new.title,new.normalized_text,new.tags_json);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_ad AFTER DELETE ON memory_items BEGIN
  DELETE FROM memory_items_fts WHERE item_id=old.id;
END;

CREATE TABLE IF NOT EXISTS semantic_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  normalized_prompt TEXT NOT NULL,
  response_json TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, namespace, prompt_hash)
);
CREATE INDEX IF NOT EXISTS idx_semantic_cache_lookup
  ON semantic_cache(user_id, namespace, prompt_hash, expires_at);
