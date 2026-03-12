ALTER TABLE project ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS export_job_v2 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('png', 'pdf', 'mp4')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'canceling', 'canceled', 'succeeded', 'failed')),
  fps INTEGER,
  resolution TEXT,
  output_path TEXT,
  error_message TEXT,
  retry_of_job_id TEXT REFERENCES export_job_v2(id) ON DELETE SET NULL,
  cancel_requested_at TEXT,
  canceled_at TEXT,
  worker_heartbeat_at TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO export_job_v2 (
  id,
  project_id,
  export_type,
  status,
  fps,
  resolution,
  output_path,
  error_message,
  progress_pct,
  created_at,
  updated_at
)
SELECT
  id,
  project_id,
  export_type,
  status,
  fps,
  resolution,
  output_path,
  error_message,
  progress_pct,
  created_at,
  updated_at
FROM export_job;

DROP TABLE export_job;
ALTER TABLE export_job_v2 RENAME TO export_job;
CREATE INDEX IF NOT EXISTS idx_export_job_project_id ON export_job(project_id);

PRAGMA foreign_keys = ON;
