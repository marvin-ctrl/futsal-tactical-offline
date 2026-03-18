PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS project_v4 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  court_type TEXT NOT NULL DEFAULT 'full' CHECK (court_type IN ('full', 'half', 'half-attacking', 'half-defending')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'attacking pattern',
  restart_type TEXT NOT NULL DEFAULT 'none',
  system TEXT,
  age_band TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_template_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO project_v4 (
  id,
  name,
  court_type,
  schema_version,
  description,
  category,
  restart_type,
  system,
  age_band,
  tags_json,
  source_template_id,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  COALESCE(court_type, 'full'),
  COALESCE(schema_version, 1),
  COALESCE(description, ''),
  COALESCE(category, 'attacking pattern'),
  COALESCE(restart_type, 'none'),
  system,
  age_band,
  COALESCE(tags_json, '[]'),
  source_template_id,
  created_at,
  updated_at
FROM project;

DROP TABLE project;
ALTER TABLE project_v4 RENAME TO project;

PRAGMA foreign_keys = ON;
