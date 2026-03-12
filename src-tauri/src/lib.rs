mod db;
pub mod models;
pub mod renderer;

use models::{ExportJobPayload, Mp4ExportRequest, ProjectRow, TacticalProjectPayload};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use thiserror::Error;

#[tauri::command]
fn healthcheck() -> String {
    "tauri runtime available".to_string()
}

#[tauri::command]
fn init_database(app: AppHandle) -> Result<String, String> {
    db::init_database(&app).map_err(|error| error.to_string())?;
    Ok("sqlite initialized".to_string())
}

#[tauri::command]
fn list_projects(app: AppHandle) -> Result<Vec<ProjectRow>, String> {
    db::list_projects(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_project(app: AppHandle, project: TacticalProjectPayload) -> Result<String, String> {
    db::save_project(&app, &project).map_err(|error| error.to_string())?;
    Ok(format!("project {} saved", project.meta.id))
}

#[tauri::command]
fn load_project(app: AppHandle, project_id: String) -> Result<TacticalProjectPayload, String> {
    db::load_project(&app, &project_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_export_jobs(app: AppHandle, project_id: String) -> Result<Vec<ExportJobPayload>, String> {
    db::list_export_jobs(&app, &project_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_export_job(app: AppHandle, job_id: String) -> Result<ExportJobPayload, String> {
    db::get_export_job(&app, &job_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_export_job(app: AppHandle, job_id: String) -> Result<ExportJobPayload, String> {
    db::request_export_cancel(&app, &job_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn enqueue_mp4_export(app: AppHandle, request: Mp4ExportRequest) -> Result<ExportJobPayload, String> {
    validate_export_request(&request)?;
    db::init_database(&app).map_err(|error| error.to_string())?;

    let job_id = generate_id("export");
    let resolution = format!("{}x{}", request.width, request.height);
    let queued_job = db::create_export_job(
        &app,
        &job_id,
        &request.project_id,
        request.fps as i64,
        &resolution,
        None,
    )
    .map_err(|error| error.to_string())?;

    spawn_export_worker(app, job_id, request);
    Ok(queued_job)
}

#[tauri::command]
fn retry_export_job(app: AppHandle, job_id: String) -> Result<ExportJobPayload, String> {
    db::init_database(&app).map_err(|error| error.to_string())?;
    let existing_job = db::get_export_job(&app, &job_id).map_err(|error| error.to_string())?;
    let (width, height) = parse_resolution(existing_job.resolution.as_deref())?;
    let fps = existing_job.fps.unwrap_or(30) as u32;
    let project = db::load_project(&app, &existing_job.project_id).map_err(|error| error.to_string())?;
    let duration_ms = total_project_duration_ms(&project) as u64;
    let request = Mp4ExportRequest {
        project_id: existing_job.project_id.clone(),
        fps,
        width,
        height,
        duration_ms,
        output_file_name: Some(format!(
            "{}-retry-{}.mp4",
            existing_job.project_id,
            unix_timestamp_millis()
        )),
        input_pattern: None,
    };
    validate_export_request(&request)?;

    let new_job_id = generate_id("export");
    let resolution = format!("{}x{}", request.width, request.height);
    let queued_job = db::create_export_job(
        &app,
        &new_job_id,
        &request.project_id,
        request.fps as i64,
        &resolution,
        Some(&job_id),
    )
    .map_err(|error| error.to_string())?;

    spawn_export_worker(app, new_job_id, request);
    Ok(queued_job)
}

fn spawn_export_worker(app: AppHandle, job_id: String, request: Mp4ExportRequest) {
    std::thread::spawn(move || match run_mp4_export_worker(&app, &job_id, &request) {
        Ok(()) => {}
        Err(ExportError::Canceled) => {
            let _ = db::mark_export_canceled(&app, &job_id);
        }
        Err(error) => {
            let _ = db::mark_export_failed(&app, &job_id, &error.to_string());
        }
    });
}

fn validate_export_request(request: &Mp4ExportRequest) -> Result<(), String> {
    if request.project_id.trim().is_empty() {
        return Err("projectId is required".to_string());
    }

    if request.fps != 30 && request.fps != 60 {
        return Err("fps must be 30 or 60 for MVP".to_string());
    }

    if request.width == 0 || request.height == 0 {
        return Err("width and height must be greater than zero".to_string());
    }

    if request.duration_ms == 0 {
        return Err("durationMs must be greater than zero".to_string());
    }

    Ok(())
}

fn run_mp4_export_worker(
    app: &AppHandle,
    job_id: &str,
    request: &Mp4ExportRequest,
) -> Result<(), ExportError> {
    db::mark_export_running(app, job_id)?;
    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_progress(app, job_id, 15)?;

    let output_path = resolve_export_output_path(app, request)?;
    let resolved_input = match resolve_frame_input(app, job_id, request) {
        Ok(result) => result,
        Err(ExportError::Canceled) => {
            return Err(ExportError::Canceled);
        }
        Err(error) => return Err(error),
    };

    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_progress(app, job_id, 66)?;
    db::heartbeat_export_job(app, job_id)?;
    run_ffmpeg(&resolved_input.frame_input_pattern, request, &output_path)?;
    db::heartbeat_export_job(app, job_id)?;
    db::mark_export_progress(app, job_id, 92)?;
    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_succeeded(app, job_id, output_path.to_string_lossy().as_ref())?;

    if let Some(frames_dir) = resolved_input.frames_dir {
        let _ = std::fs::remove_dir_all(frames_dir);
    }
    Ok(())
}

fn abort_if_cancel_requested(app: &AppHandle, job_id: &str) -> Result<(), ExportError> {
    if db::export_cancel_requested(app, job_id)? {
        return Err(ExportError::Canceled);
    }
    Ok(())
}

fn resolve_export_output_path(
    app: &AppHandle,
    request: &Mp4ExportRequest,
) -> Result<PathBuf, ExportError> {
    let mut exports_dir = db::exports_dir(app)?;
    let default_name = format!("{}-{}.mp4", request.project_id, unix_timestamp_millis());
    let chosen_name = request
        .output_file_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&default_name);
    let sanitized_name = sanitize_mp4_name(chosen_name);
    exports_dir.push(sanitized_name);
    Ok(exports_dir)
}

struct ResolvedFrameInput {
    frame_input_pattern: String,
    frames_dir: Option<PathBuf>,
}

fn resolve_frame_input(
    app: &AppHandle,
    job_id: &str,
    request: &Mp4ExportRequest,
) -> Result<ResolvedFrameInput, ExportError> {
    if let Some(pattern) = request
        .input_pattern
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(ResolvedFrameInput {
            frame_input_pattern: pattern.to_string(),
            frames_dir: None,
        });
    }

    let project = db::load_project(app, &request.project_id)?;
    let mut frames_dir = db::exports_dir(app)?;
    frames_dir.push(format!("frames_{job_id}"));
    let mut last_progress = 15_i64;
    let render_result = renderer::render_project_sequence_with_progress(
        &project,
        request.width,
        request.height,
        request.fps,
        request.duration_ms,
        &frames_dir,
        |rendered_frames, total_frames| {
            if rendered_frames % 5 == 0 || rendered_frames == total_frames {
                db::heartbeat_export_job(app, job_id)
                    .map_err(|error| renderer::RendererError::Invalid(error.to_string()))?;
                if db::export_cancel_requested(app, job_id)
                    .map_err(|error| renderer::RendererError::Invalid(error.to_string()))?
                {
                    return Err(renderer::RendererError::Canceled);
                }
            }
            if total_frames > 0 {
                let progress = 15 + ((rendered_frames as i64 * 50) / total_frames as i64);
                if progress > last_progress {
                    db::mark_export_progress(app, job_id, progress)
                        .map_err(|error| renderer::RendererError::Invalid(error.to_string()))?;
                    last_progress = progress;
                }
            }
            Ok(())
        },
    );

    match render_result {
        Ok(rendered) => Ok(ResolvedFrameInput {
            frame_input_pattern: rendered.frame_input_pattern,
            frames_dir: Some(rendered.frames_dir),
        }),
        Err(renderer::RendererError::Canceled) => {
            let _ = std::fs::remove_dir_all(&frames_dir);
            Err(ExportError::Canceled)
        }
        Err(error) => {
            let _ = std::fs::remove_dir_all(&frames_dir);
            Err(ExportError::Renderer(error))
        }
    }
}

fn run_ffmpeg(
    input_pattern: &str,
    request: &Mp4ExportRequest,
    output_path: &PathBuf,
) -> Result<(), ExportError> {
    let mut command = Command::new("ffmpeg");
    let output_path_str = output_path.to_string_lossy().to_string();
    command.arg("-y");
    let fps = request.fps.to_string();
    let filter = format!("scale={}:{},format=yuv420p", request.width, request.height);
    command.args([
        "-framerate",
        fps.as_str(),
        "-start_number",
        "1",
        "-i",
        input_pattern,
        "-vf",
        filter.as_str(),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output_path_str.as_str(),
    ]);

    let output = command.output()?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let tail = tail_lines(&stderr, 8);
    Err(ExportError::FfmpegFailed(format!(
        "ffmpeg exited with {}: {}",
        output.status, tail
    )))
}

fn parse_resolution(resolution: Option<&str>) -> Result<(u32, u32), String> {
    let Some(value) = resolution else {
        return Err("export job has no resolution to retry".to_string());
    };
    let mut parts = value.split('x');
    let width = parts
        .next()
        .ok_or_else(|| "invalid resolution width".to_string())?
        .parse::<u32>()
        .map_err(|_| "invalid resolution width".to_string())?;
    let height = parts
        .next()
        .ok_or_else(|| "invalid resolution height".to_string())?
        .parse::<u32>()
        .map_err(|_| "invalid resolution height".to_string())?;
    Ok((width, height))
}

fn total_project_duration_ms(project: &TacticalProjectPayload) -> i64 {
    project
        .scenes
        .iter()
        .map(|scene| scene.duration_ms)
        .sum::<i64>()
        .max(1000)
}

fn sanitize_mp4_name(file_name: &str) -> String {
    let mut sanitized = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();

    if !sanitized.to_lowercase().ends_with(".mp4") {
        sanitized.push_str(".mp4");
    }

    if sanitized == ".mp4" {
        format!("export-{}.mp4", unix_timestamp_millis())
    } else {
        sanitized
    }
}

fn generate_id(prefix: &str) -> String {
    format!("{}_{}", prefix, unix_timestamp_millis())
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn tail_lines(input: &str, line_count: usize) -> String {
    input
        .lines()
        .rev()
        .take(line_count)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" | ")
}

#[derive(Debug, Error)]
enum ExportError {
    #[error("database error: {0}")]
    Db(#[from] db::DbError),
    #[error("renderer error: {0}")]
    Renderer(#[from] renderer::RendererError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("export canceled")]
    Canceled,
    #[error("{0}")]
    FfmpegFailed(String),
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            init_database,
            list_projects,
            save_project,
            load_project,
            list_export_jobs,
            get_export_job,
            cancel_export_job,
            enqueue_mp4_export,
            retry_export_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
