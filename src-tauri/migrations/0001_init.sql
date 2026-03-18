PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  court_type TEXT NOT NULL DEFAULT 'full' CHECK (court_type IN ('full', 'half', 'half-attacking', 'half-defending')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scene (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keyframe (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scene(id) ON DELETE CASCADE,
  timestamp_ms INTEGER NOT NULL,
  drawable_state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS export_job (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('png', 'pdf', 'mp4')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  fps INTEGER,
  resolution TEXT,
  output_path TEXT,
  error_message TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scene_project_id ON scene(project_id);
CREATE INDEX IF NOT EXISTS idx_keyframe_scene_id ON keyframe(scene_id);
CREATE INDEX IF NOT EXISTS idx_export_job_project_id ON export_job(project_id);
