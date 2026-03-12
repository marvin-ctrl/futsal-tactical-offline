use crate::models::{
    ExportJobPayload, KeyframePayload, ProjectMetaPayload, ProjectRow, ScenePayload,
    TacticalProjectPayload,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("unable to resolve app data directory")]
    MissingDataDirectory,
    #[error("project not found: {0}")]
    MissingProject(String),
    #[error("invalid project payload: {0}")]
    Validation(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, DbError> {
    let resolver = app.path();
    let data_dir = resolver
        .app_data_dir()
        .map_err(|_| DbError::MissingDataDirectory)?;
    Ok(data_dir)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, DbError> {
    let mut data_dir = app_data_dir(app)?;
    std::fs::create_dir_all(&data_dir)?;
    data_dir.push("futsal_tactical.sqlite");
    Ok(data_dir)
}

pub fn exports_dir(app: &AppHandle) -> Result<PathBuf, DbError> {
    let mut dir = app_data_dir(app)?;
    dir.push("exports");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn connect(app: &AppHandle) -> Result<Connection, DbError> {
    let path = db_path(app)?;
    Connection::open(path).map_err(DbError::from)
}

pub fn init_database(app: &AppHandle) -> Result<(), DbError> {
    let connection = connect(app)?;
    connection.execute_batch(include_str!("../migrations/0001_init.sql"))?;
    ensure_project_court_type_column(&connection)?;
    ensure_project_schema_version_column(&connection)?;
    ensure_export_job_v2_schema(&connection)?;
    seed_sprint_zero_data(&connection)?;
    Ok(())
}

fn ensure_project_court_type_column(connection: &Connection) -> Result<(), DbError> {
    ignore_duplicate_column(connection.execute(
        "ALTER TABLE project ADD COLUMN court_type TEXT NOT NULL DEFAULT 'full'",
        [],
    ))
}

fn ensure_project_schema_version_column(connection: &Connection) -> Result<(), DbError> {
    ignore_duplicate_column(connection.execute(
        "ALTER TABLE project ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
        [],
    ))?;
    connection.execute(
        "UPDATE project SET schema_version = COALESCE(schema_version, 1)",
        [],
    )?;
    Ok(())
}

fn ignore_duplicate_column(result: Result<usize, rusqlite::Error>) -> Result<(), DbError> {
    if let Err(error) = result {
        let message = error.to_string();
        if !message.contains("duplicate column name") {
            return Err(DbError::Sqlite(error));
        }
    }
    Ok(())
}

fn ensure_export_job_v2_schema(connection: &Connection) -> Result<(), DbError> {
    let Some(table_sql) = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'export_job'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    else {
        return Ok(());
    };

    let existing_columns = table_columns(connection, "export_job")?;
    let required_columns = [
        "retry_of_job_id",
        "cancel_requested_at",
        "canceled_at",
        "worker_heartbeat_at",
    ];
    let missing_columns = required_columns
        .iter()
        .any(|column| !existing_columns.iter().any(|existing| existing == column));
    let stale_status_constraint = !table_sql.contains("canceling") || !table_sql.contains("canceled");

    if !missing_columns && !stale_status_constraint {
        return Ok(());
    }

    connection.execute_batch(
        "PRAGMA foreign_keys = OFF;

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
        PRAGMA foreign_keys = ON;",
    )?;
    Ok(())
}

fn table_columns(connection: &Connection, table_name: &str) -> Result<Vec<String>, DbError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
}

fn seed_sprint_zero_data(connection: &Connection) -> Result<(), DbError> {
    connection.execute(
        "INSERT OR IGNORE INTO project (id, name, court_type, schema_version) VALUES (?1, ?2, ?3, ?4)",
        params!["project_local_seed", "Sprint 0 Prototype", "full", 2],
    )?;

    connection.execute(
        "INSERT OR IGNORE INTO scene (id, project_id, name, order_index, duration_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["scene_1", "project_local_seed", "Build-Up", 0, 8000],
    )?;

    let kf_one = serde_json::json!({
        "p1": {
            "id": "p1",
            "type": "player",
            "x": 120,
            "y": 240,
            "rotation": 0,
            "label": "1",
            "style": {
                "stroke": "#111827",
                "fill": "#2d6a4f",
                "strokeWidth": 2,
                "opacity": 1
            }
        },
        "ball1": {
            "id": "ball1",
            "type": "ball",
            "x": 165,
            "y": 236,
            "rotation": 0,
            "style": {
                "stroke": "#111827",
                "fill": "#f4d35e",
                "strokeWidth": 1,
                "opacity": 1
            }
        },
        "run_arrow": {
            "id": "run_arrow",
            "type": "arrow",
            "x": 132,
            "y": 240,
            "x2": 342,
            "y2": 222,
            "rotation": 0,
            "width": 210,
            "height": -18,
            "style": {
                "stroke": "#38bdf8",
                "fill": "#38bdf8",
                "strokeWidth": 3,
                "opacity": 0.95,
                "dashed": true
            }
        },
        "zone1": {
            "id": "zone1",
            "type": "zone",
            "x": 230,
            "y": 150,
            "x2": 360,
            "y2": 230,
            "rotation": 0,
            "width": 130,
            "height": 80,
            "style": {
                "stroke": "#d97706",
                "fill": "#f59e0b",
                "strokeWidth": 2,
                "opacity": 0.2
            }
        }
    });

    let kf_two = serde_json::json!({
        "p1": {
            "id": "p1",
            "type": "player",
            "x": 420,
            "y": 220,
            "rotation": 15,
            "label": "1",
            "style": {
                "stroke": "#111827",
                "fill": "#2d6a4f",
                "strokeWidth": 2,
                "opacity": 1
            }
        },
        "ball1": {
            "id": "ball1",
            "type": "ball",
            "x": 440,
            "y": 205,
            "rotation": 0,
            "style": {
                "stroke": "#111827",
                "fill": "#f4d35e",
                "strokeWidth": 1,
                "opacity": 1
            }
        },
        "run_arrow": {
            "id": "run_arrow",
            "type": "arrow",
            "x": 420,
            "y": 220,
            "x2": 560,
            "y2": 320,
            "rotation": 0,
            "width": 140,
            "height": 100,
            "style": {
                "stroke": "#38bdf8",
                "fill": "#38bdf8",
                "strokeWidth": 3,
                "opacity": 0.95,
                "dashed": true
            }
        },
        "zone1": {
            "id": "zone1",
            "type": "zone",
            "x": 360,
            "y": 160,
            "x2": 500,
            "y2": 250,
            "rotation": 0,
            "width": 140,
            "height": 90,
            "style": {
                "stroke": "#d97706",
                "fill": "#f59e0b",
                "strokeWidth": 2,
                "opacity": 0.2
            }
        }
    });

    connection.execute(
        "INSERT OR IGNORE INTO keyframe (id, scene_id, timestamp_ms, drawable_state_json)
         VALUES (?1, ?2, ?3, ?4)",
        params!["kf_1", "scene_1", 0, serde_json::to_string(&kf_one)?],
    )?;

    connection.execute(
        "INSERT OR IGNORE INTO keyframe (id, scene_id, timestamp_ms, drawable_state_json)
         VALUES (?1, ?2, ?3, ?4)",
        params!["kf_2", "scene_1", 8000, serde_json::to_string(&kf_two)?],
    )?;

    Ok(())
}

pub fn list_projects(app: &AppHandle) -> Result<Vec<ProjectRow>, DbError> {
    init_database(app)?;
    let connection = connect(app)?;
    let mut statement = connection.prepare(
        "SELECT id, name, updated_at FROM project ORDER BY datetime(updated_at) DESC",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
}

fn validate_project_payload(project: &TacticalProjectPayload) -> Result<(), DbError> {
    if project.meta.id.trim().is_empty() {
        return Err(DbError::Validation(
            "project.meta.id must be a non-empty string".to_string(),
        ));
    }

    if project.meta.name.trim().is_empty() {
        return Err(DbError::Validation(
            "project.meta.name must be a non-empty string".to_string(),
        ));
    }

    if project.meta.schema_version < 1 {
        return Err(DbError::Validation(
            "project.meta.schemaVersion must be >= 1".to_string(),
        ));
    }

    if let Some(court_type) = project.meta.court_type.as_deref() {
        if court_type != "full" && court_type != "half" {
            return Err(DbError::Validation(
                "project.meta.courtType must be either 'full' or 'half'".to_string(),
            ));
        }
    }

    let mut scene_ids = HashSet::new();

    for scene in &project.scenes {
        if scene.project_id != project.meta.id {
            return Err(DbError::Validation(format!(
                "scene {} project_id does not match project id {}",
                scene.id, project.meta.id
            )));
        }
        if scene.duration_ms <= 0 {
            return Err(DbError::Validation(format!(
                "scene {} duration_ms must be > 0",
                scene.id
            )));
        }
        scene_ids.insert(scene.id.clone());
    }

    for keyframe in &project.keyframes {
        if keyframe.timestamp_ms < 0 {
            return Err(DbError::Validation(format!(
                "keyframe {} timestamp_ms must be >= 0",
                keyframe.id
            )));
        }
        if !scene_ids.contains(&keyframe.scene_id) {
            return Err(DbError::Validation(format!(
                "keyframe {} references unknown scene_id {}",
                keyframe.id, keyframe.scene_id
            )));
        }
    }

    Ok(())
}

pub fn save_project(app: &AppHandle, project: &TacticalProjectPayload) -> Result<(), DbError> {
    init_database(app)?;
    validate_project_payload(project)?;

    let mut connection = connect(app)?;
    let transaction = connection.transaction()?;

    transaction.execute(
        "INSERT INTO project (id, name, court_type, schema_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           court_type = excluded.court_type,
           schema_version = excluded.schema_version,
           updated_at = CURRENT_TIMESTAMP",
        params![
            project.meta.id,
            project.meta.name,
            project.meta.court_type.as_deref().unwrap_or("full"),
            project.meta.schema_version,
        ],
    )?;

    transaction.execute(
        "DELETE FROM scene WHERE project_id = ?1",
        params![project.meta.id],
    )?;

    {
        let mut scene_statement = transaction.prepare(
            "INSERT INTO scene (id, project_id, name, order_index, duration_ms, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )?;

        for scene in &project.scenes {
            scene_statement.execute(params![
                scene.id,
                scene.project_id,
                scene.name,
                scene.order_index,
                scene.duration_ms
            ])?;
        }
    }

    {
        let mut keyframe_statement = transaction.prepare(
            "INSERT INTO keyframe (id, scene_id, timestamp_ms, drawable_state_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )?;

        for keyframe in &project.keyframes {
            keyframe_statement.execute(params![
                keyframe.id,
                keyframe.scene_id,
                keyframe.timestamp_ms,
                serde_json::to_string(&keyframe.drawable_state)?
            ])?;
        }
    }

    transaction.execute(
        "UPDATE project SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![project.meta.id],
    )?;

    transaction.commit()?;
    Ok(())
}

pub fn load_project(app: &AppHandle, project_id: &str) -> Result<TacticalProjectPayload, DbError> {
    init_database(app)?;
    let connection = connect(app)?;

    let meta = connection
        .query_row(
            "SELECT id, name, court_type, schema_version, created_at, updated_at FROM project WHERE id = ?1",
            params![project_id],
            |row| {
                Ok(ProjectMetaPayload {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    court_type: row.get(2)?,
                    schema_version: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| DbError::MissingProject(project_id.to_string()))?;

    let mut scene_statement = connection.prepare(
        "SELECT id, project_id, name, order_index, duration_ms
         FROM scene
         WHERE project_id = ?1
         ORDER BY order_index ASC",
    )?;

    let scenes = scene_statement
        .query_map(params![project_id], |row| {
            Ok(ScenePayload {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                order_index: row.get(3)?,
                duration_ms: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut keyframe_statement = connection.prepare(
        "SELECT k.id, k.scene_id, k.timestamp_ms, k.drawable_state_json
         FROM keyframe k
         INNER JOIN scene s ON s.id = k.scene_id
         WHERE s.project_id = ?1
         ORDER BY s.order_index ASC, k.timestamp_ms ASC",
    )?;

    let keyframes = keyframe_statement
        .query_map(params![project_id], |row| {
            let drawable_state_json: String = row.get(3)?;
            let drawable_state = serde_json::from_str(&drawable_state_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;

            Ok(KeyframePayload {
                id: row.get(0)?,
                scene_id: row.get(1)?,
                timestamp_ms: row.get(2)?,
                drawable_state,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(TacticalProjectPayload {
        meta,
        scenes,
        keyframes,
    })
}

pub fn create_export_job(
    app: &AppHandle,
    job_id: &str,
    project_id: &str,
    fps: i64,
    resolution: &str,
    retry_of_job_id: Option<&str>,
) -> Result<ExportJobPayload, DbError> {
    init_database(app)?;
    let connection = connect(app)?;
    connection.execute(
        "INSERT INTO export_job (
          id,
          project_id,
          export_type,
          status,
          fps,
          resolution,
          retry_of_job_id,
          progress_pct,
          created_at,
          updated_at
         ) VALUES (
          ?1, ?2, 'mp4', 'queued', ?3, ?4, ?5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )",
        params![job_id, project_id, fps, resolution, retry_of_job_id],
    )?;

    get_export_job(app, job_id)
}

pub fn mark_export_running(app: &AppHandle, job_id: &str) -> Result<(), DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET status = 'running',
             progress_pct = 5,
             error_message = NULL,
             worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id],
    )?;
    Ok(())
}

pub fn heartbeat_export_job(app: &AppHandle, job_id: &str) -> Result<(), DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id],
    )?;
    Ok(())
}

pub fn mark_export_progress(app: &AppHandle, job_id: &str, progress_pct: i64) -> Result<(), DbError> {
    let connection = connect(app)?;
    let clamped_progress = progress_pct.clamp(0, 99);
    connection.execute(
        "UPDATE export_job
         SET progress_pct = ?2,
             worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id, clamped_progress],
    )?;
    Ok(())
}

pub fn request_export_cancel(app: &AppHandle, job_id: &str) -> Result<ExportJobPayload, DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET status = CASE
             WHEN status = 'queued' THEN 'canceled'
             WHEN status IN ('running', 'canceling') THEN 'canceling'
             ELSE status
           END,
           progress_pct = CASE WHEN status = 'queued' THEN 100 ELSE progress_pct END,
           cancel_requested_at = CURRENT_TIMESTAMP,
           canceled_at = CASE WHEN status = 'queued' THEN CURRENT_TIMESTAMP ELSE canceled_at END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id],
    )?;

    get_export_job(app, job_id)
}

pub fn export_cancel_requested(app: &AppHandle, job_id: &str) -> Result<bool, DbError> {
    let connection = connect(app)?;
    let requested = connection.query_row(
        "SELECT cancel_requested_at IS NOT NULL FROM export_job WHERE id = ?1",
        params![job_id],
        |row| row.get::<_, bool>(0),
    )?;
    Ok(requested)
}

pub fn mark_export_succeeded(
    app: &AppHandle,
    job_id: &str,
    output_path: &str,
) -> Result<ExportJobPayload, DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET status = 'succeeded',
             progress_pct = 100,
             output_path = ?2,
             error_message = NULL,
             worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id, output_path],
    )?;

    get_export_job(app, job_id)
}

pub fn mark_export_failed(
    app: &AppHandle,
    job_id: &str,
    error_message: &str,
) -> Result<ExportJobPayload, DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET status = 'failed',
             progress_pct = 100,
             error_message = ?2,
             worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id, error_message],
    )?;

    get_export_job(app, job_id)
}

pub fn mark_export_canceled(app: &AppHandle, job_id: &str) -> Result<ExportJobPayload, DbError> {
    let connection = connect(app)?;
    connection.execute(
        "UPDATE export_job
         SET status = 'canceled',
             progress_pct = 100,
             error_message = NULL,
             canceled_at = COALESCE(canceled_at, CURRENT_TIMESTAMP),
             worker_heartbeat_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![job_id],
    )?;

    get_export_job(app, job_id)
}

fn reconcile_stale_exports(connection: &Connection) -> Result<(), DbError> {
    connection.execute(
        "UPDATE export_job
         SET status = 'failed',
             progress_pct = 100,
             error_message = COALESCE(error_message, 'export worker heartbeat stale'),
             updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('running', 'canceling')
           AND (
             worker_heartbeat_at IS NULL OR
             (CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', worker_heartbeat_at) AS INTEGER)) > 30
           )",
        [],
    )?;
    Ok(())
}

pub fn get_export_job(app: &AppHandle, job_id: &str) -> Result<ExportJobPayload, DbError> {
    init_database(app)?;
    let connection = connect(app)?;
    reconcile_stale_exports(&connection)?;
    let job = connection
        .query_row(
            "SELECT
              id,
              project_id,
              export_type,
              status,
              fps,
              resolution,
              output_path,
              error_message,
              retry_of_job_id,
              cancel_requested_at,
              canceled_at,
              worker_heartbeat_at,
              progress_pct,
              created_at,
              updated_at
             FROM export_job
             WHERE id = ?1",
            params![job_id],
            map_export_job_row,
        )
        .optional()?
        .ok_or_else(|| DbError::Validation(format!("export job {} does not exist", job_id)))?;

    Ok(job)
}

pub fn list_export_jobs(app: &AppHandle, project_id: &str) -> Result<Vec<ExportJobPayload>, DbError> {
    init_database(app)?;
    let connection = connect(app)?;
    reconcile_stale_exports(&connection)?;
    let mut statement = connection.prepare(
        "SELECT
          id,
          project_id,
          export_type,
          status,
          fps,
          resolution,
          output_path,
          error_message,
          retry_of_job_id,
          cancel_requested_at,
          canceled_at,
          worker_heartbeat_at,
          progress_pct,
          created_at,
          updated_at
         FROM export_job
         WHERE project_id = ?1
         ORDER BY datetime(created_at) DESC",
    )?;

    let jobs = statement
        .query_map(params![project_id], map_export_job_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(jobs)
}

fn map_export_job_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExportJobPayload> {
    Ok(ExportJobPayload {
        id: row.get(0)?,
        project_id: row.get(1)?,
        export_type: row.get(2)?,
        status: row.get(3)?,
        fps: row.get(4)?,
        resolution: row.get(5)?,
        output_path: row.get(6)?,
        error_message: row.get(7)?,
        retry_of_job_id: row.get(8)?,
        cancel_requested_at: row.get(9)?,
        canceled_at: row.get(10)?,
        worker_heartbeat_at: row.get(11)?,
        progress_pct: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}
