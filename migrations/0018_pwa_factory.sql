CREATE TABLE IF NOT EXISTS pwa_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  objective TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  repository TEXT,
  branch TEXT,
  preview_url TEXT,
  production_url TEXT,
  current_version INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_pwa_projects_user_updated ON pwa_projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS pwa_project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_json TEXT NOT NULL,
  commit_sha TEXT,
  build_status TEXT NOT NULL DEFAULT 'pending',
  build_run_id TEXT,
  preview_url TEXT,
  production_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES pwa_projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pwa_versions_project ON pwa_project_versions(project_id, version DESC);
