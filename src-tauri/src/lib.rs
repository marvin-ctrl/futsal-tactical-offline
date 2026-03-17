mod db;
pub mod models;
pub mod renderer;

use image::{codecs::jpeg::JpegEncoder, DynamicImage, ExtendedColorType, RgbaImage};
use models::{
    ExportJobPayload, ExportRequestPayload, Mp4ExportRequest, ProjectRow, StaticExportRequest,
    TacticalProjectPayload,
};
use std::path::{Path, PathBuf};
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
fn delete_project(app: AppHandle, project_id: String) -> Result<String, String> {
    db::delete_project(&app, &project_id).map_err(|error| error.to_string())?;
    Ok(project_id)
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
    queue_export_job(app, mp4_request_to_payload(request), None)
}

#[tauri::command]
fn enqueue_png_export(app: AppHandle, request: StaticExportRequest) -> Result<ExportJobPayload, String> {
    queue_export_job(app, static_request_to_payload(request, "png"), None)
}

#[tauri::command]
fn enqueue_pdf_export(app: AppHandle, request: StaticExportRequest) -> Result<ExportJobPayload, String> {
    queue_export_job(app, static_request_to_payload(request, "pdf"), None)
}

#[tauri::command]
fn retry_export_job(app: AppHandle, job_id: String) -> Result<ExportJobPayload, String> {
    db::init_database(&app).map_err(|error| error.to_string())?;
    let existing_job = db::get_export_job(&app, &job_id).map_err(|error| error.to_string())?;
    let mut request = load_export_request_for_retry(&app, &job_id, &existing_job)?;
    request.output_file_name = Some(default_retry_output_name(
        &existing_job.project_id,
        &existing_job.export_type,
    )?);

    queue_export_job(app, request, Some(&job_id))
}

fn queue_export_job(
    app: AppHandle,
    request: ExportRequestPayload,
    retry_of_job_id: Option<&str>,
) -> Result<ExportJobPayload, String> {
    validate_export_request(&request)?;
    db::init_database(&app).map_err(|error| error.to_string())?;

    let job_id = generate_id("export");
    let resolution = format!("{}x{}", request.width, request.height);
    let request_json =
        serde_json::to_string(&request).map_err(|error| format!("invalid export payload: {error}"))?;
    let queued_job = db::create_export_job(
        &app,
        &job_id,
        &request.project_id,
        &request.export_type,
        request.fps.map(i64::from),
        &resolution,
        Some(&request_json),
        retry_of_job_id,
    )
    .map_err(|error| error.to_string())?;

    spawn_export_worker(app, job_id, request);
    Ok(queued_job)
}

fn spawn_export_worker(app: AppHandle, job_id: String, request: ExportRequestPayload) {
    std::thread::spawn(move || match run_export_worker(&app, &job_id, &request) {
        Ok(()) => {}
        Err(ExportError::Canceled) => {
            let _ = db::mark_export_canceled(&app, &job_id);
        }
        Err(error) => {
            let _ = db::mark_export_failed(&app, &job_id, &error.to_string());
        }
    });
}

fn validate_export_request(request: &ExportRequestPayload) -> Result<(), String> {
    if request.project_id.trim().is_empty() {
        return Err("projectId is required".to_string());
    }

    if request.width == 0 || request.height == 0 {
        return Err("width and height must be greater than zero".to_string());
    }

    match request.export_type.as_str() {
        "mp4" => {
            let fps = request
                .fps
                .ok_or_else(|| "fps is required for MP4 exports".to_string())?;
            if fps != 30 && fps != 60 {
                return Err("fps must be 30 or 60 for MVP".to_string());
            }

            let duration_ms = request
                .duration_ms
                .ok_or_else(|| "durationMs is required for MP4 exports".to_string())?;
            if duration_ms == 0 {
                return Err("durationMs must be greater than zero".to_string());
            }
        }
        "png" | "pdf" => {
            if request.timestamp_ms.is_none() {
                return Err("timestampMs is required for static exports".to_string());
            }
        }
        _ => {
            return Err(format!(
                "unsupported export type '{}'",
                request.export_type
            ))
        }
    }

    Ok(())
}

fn run_export_worker(
    app: &AppHandle,
    job_id: &str,
    request: &ExportRequestPayload,
) -> Result<(), ExportError> {
    match request.export_type.as_str() {
        "mp4" => {
            let mp4_request = payload_to_mp4_request(request)?;
            run_mp4_export_worker(app, job_id, &mp4_request)
        }
        "png" | "pdf" => {
            let static_request = payload_to_static_request(request)?;
            run_static_export_worker(app, job_id, &static_request, &request.export_type)
        }
        _ => Err(ExportError::Invalid(format!(
            "unsupported export type '{}'",
            request.export_type
        ))),
    }
}

fn run_mp4_export_worker(
    app: &AppHandle,
    job_id: &str,
    request: &Mp4ExportRequest,
) -> Result<(), ExportError> {
    db::mark_export_running(app, job_id)?;
    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_progress(app, job_id, 15)?;

    let output_path = resolve_export_output_path(
        app,
        &request.project_id,
        request.output_file_name.as_deref(),
        "mp4",
    )?;
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

fn run_static_export_worker(
    app: &AppHandle,
    job_id: &str,
    request: &StaticExportRequest,
    export_type: &str,
) -> Result<(), ExportError> {
    db::mark_export_running(app, job_id)?;
    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_progress(app, job_id, 25)?;

    let project = db::load_project(app, &request.project_id)?;
    let output_path = resolve_export_output_path(
        app,
        &request.project_id,
        request.output_file_name.as_deref(),
        export_type,
    )?;
    let frame =
        renderer::render_project_frame_at(&project, request.width, request.height, request.timestamp_ms)?;

    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_progress(app, job_id, 80)?;

    match export_type {
        "png" => frame.save(&output_path)?,
        "pdf" => write_frame_pdf(&frame, &output_path)?,
        _ => {
            return Err(ExportError::Invalid(format!(
                "unsupported static export type '{}'",
                export_type
            )))
        }
    }

    abort_if_cancel_requested(app, job_id)?;
    db::mark_export_succeeded(app, job_id, output_path.to_string_lossy().as_ref())?;
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
    project_id: &str,
    output_file_name: Option<&str>,
    export_type: &str,
) -> Result<PathBuf, ExportError> {
    let mut exports_dir = db::exports_dir(app)?;
    let extension = output_extension(export_type)?;
    let default_name = format!("{}-{}.{}", project_id, unix_timestamp_millis(), extension);
    let chosen_name = output_file_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&default_name);
    let sanitized_name = sanitize_output_name(chosen_name, extension);
    exports_dir.push(sanitized_name);
    Ok(exports_dir)
}

fn write_frame_pdf(frame: &RgbaImage, output_path: &Path) -> Result<(), ExportError> {
    let rgb = DynamicImage::ImageRgba8(frame.clone()).to_rgb8();
    let width = rgb.width();
    let height = rgb.height();

    let mut jpeg_bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, 90);
    encoder.encode(rgb.as_raw(), width, height, ExtendedColorType::Rgb8)?;

    let content_stream = format!("q\n{width} 0 0 {height} 0 0 cm\n/Im0 Do\nQ\n");
    let mut pdf_bytes = Vec::new();
    pdf_bytes.extend_from_slice(b"%PDF-1.4\n%\xC7\xEC\x8F\xA2\n");

    let mut offsets = Vec::new();
    write_pdf_object(
        &mut pdf_bytes,
        &mut offsets,
        1,
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
    );
    write_pdf_object(
        &mut pdf_bytes,
        &mut offsets,
        2,
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
    );
    write_pdf_object(
        &mut pdf_bytes,
        &mut offsets,
        3,
        format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>"
        )
        .into_bytes(),
    );

    let mut image_stream = format!(
        "<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
        jpeg_bytes.len()
    )
    .into_bytes();
    image_stream.extend_from_slice(&jpeg_bytes);
    image_stream.extend_from_slice(b"\nendstream");
    write_pdf_object(&mut pdf_bytes, &mut offsets, 4, image_stream);

    write_pdf_object(
        &mut pdf_bytes,
        &mut offsets,
        5,
        format!(
            "<< /Length {} >>\nstream\n{}endstream",
            content_stream.len(),
            content_stream
        )
        .into_bytes(),
    );

    let xref_offset = pdf_bytes.len();
    pdf_bytes.extend_from_slice(format!("xref\n0 {}\n", offsets.len() + 1).as_bytes());
    pdf_bytes.extend_from_slice(b"0000000000 65535 f \n");
    for offset in &offsets {
        pdf_bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf_bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            offsets.len() + 1,
            xref_offset
        )
        .as_bytes(),
    );

    std::fs::write(output_path, pdf_bytes)?;
    Ok(())
}

fn write_pdf_object(buffer: &mut Vec<u8>, offsets: &mut Vec<usize>, id: usize, body: Vec<u8>) {
    offsets.push(buffer.len());
    buffer.extend_from_slice(format!("{id} 0 obj\n").as_bytes());
    buffer.extend_from_slice(&body);
    buffer.extend_from_slice(b"\nendobj\n");
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

fn mp4_request_to_payload(request: Mp4ExportRequest) -> ExportRequestPayload {
    ExportRequestPayload {
        export_type: "mp4".to_string(),
        project_id: request.project_id,
        fps: Some(request.fps),
        width: request.width,
        height: request.height,
        duration_ms: Some(request.duration_ms),
        timestamp_ms: None,
        output_file_name: request.output_file_name,
        input_pattern: request.input_pattern,
    }
}

fn static_request_to_payload(request: StaticExportRequest, export_type: &str) -> ExportRequestPayload {
    ExportRequestPayload {
        export_type: export_type.to_string(),
        project_id: request.project_id,
        fps: None,
        width: request.width,
        height: request.height,
        duration_ms: None,
        timestamp_ms: Some(request.timestamp_ms),
        output_file_name: request.output_file_name,
        input_pattern: None,
    }
}

fn payload_to_mp4_request(request: &ExportRequestPayload) -> Result<Mp4ExportRequest, ExportError> {
    Ok(Mp4ExportRequest {
        project_id: request.project_id.clone(),
        fps: request
            .fps
            .ok_or_else(|| ExportError::Invalid("missing fps for MP4 export".to_string()))?,
        width: request.width,
        height: request.height,
        duration_ms: request.duration_ms.ok_or_else(|| {
            ExportError::Invalid("missing durationMs for MP4 export".to_string())
        })?,
        output_file_name: request.output_file_name.clone(),
        input_pattern: request.input_pattern.clone(),
    })
}

fn payload_to_static_request(
    request: &ExportRequestPayload,
) -> Result<StaticExportRequest, ExportError> {
    Ok(StaticExportRequest {
        project_id: request.project_id.clone(),
        width: request.width,
        height: request.height,
        timestamp_ms: request.timestamp_ms.ok_or_else(|| {
            ExportError::Invalid("missing timestampMs for static export".to_string())
        })?,
        output_file_name: request.output_file_name.clone(),
    })
}

fn load_export_request_for_retry(
    app: &AppHandle,
    job_id: &str,
    existing_job: &ExportJobPayload,
) -> Result<ExportRequestPayload, String> {
    if let Some(request_json) = db::get_export_request_json(app, job_id).map_err(|error| error.to_string())? {
        return serde_json::from_str(&request_json)
            .map_err(|error| format!("invalid export request metadata: {error}"));
    }

    if existing_job.export_type != "mp4" {
        return Err(format!(
            "retry metadata missing for {} export {}",
            existing_job.export_type, job_id
        ));
    }

    let (width, height) = parse_resolution(existing_job.resolution.as_deref())?;
    let fps = existing_job.fps.unwrap_or(30) as u32;
    let project = db::load_project(app, &existing_job.project_id).map_err(|error| error.to_string())?;
    let duration_ms = total_project_duration_ms(&project) as u64;
    Ok(mp4_request_to_payload(Mp4ExportRequest {
        project_id: existing_job.project_id.clone(),
        fps,
        width,
        height,
        duration_ms,
        output_file_name: None,
        input_pattern: None,
    }))
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

fn output_extension(export_type: &str) -> Result<&'static str, ExportError> {
    match export_type {
        "mp4" => Ok("mp4"),
        "png" => Ok("png"),
        "pdf" => Ok("pdf"),
        _ => Err(ExportError::Invalid(format!(
            "unsupported export type '{}'",
            export_type
        ))),
    }
}

fn default_retry_output_name(project_id: &str, export_type: &str) -> Result<String, String> {
    let extension = output_extension(export_type).map_err(|error| error.to_string())?;
    Ok(format!(
        "{}-retry-{}.{}",
        project_id,
        unix_timestamp_millis(),
        extension
    ))
}

fn sanitize_output_name(file_name: &str, extension: &str) -> String {
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

    let normalized_extension = format!(".{}", extension.to_lowercase());
    if !sanitized.to_lowercase().ends_with(&normalized_extension) {
        sanitized.push_str(&normalized_extension);
    }

    if sanitized == normalized_extension {
        format!("export-{}{}", unix_timestamp_millis(), normalized_extension)
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
    #[error("image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("export canceled")]
    Canceled,
    #[error("{0}")]
    FfmpegFailed(String),
    #[error("{0}")]
    Invalid(String),
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            init_database,
            list_projects,
            save_project,
            load_project,
            delete_project,
            list_export_jobs,
            get_export_job,
            cancel_export_job,
            enqueue_mp4_export,
            enqueue_png_export,
            enqueue_pdf_export,
            retry_export_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{sanitize_output_name, write_frame_pdf};
    use image::{Rgba, RgbaImage};
    use std::fs;

    #[test]
    fn sanitize_output_name_appends_expected_extension() {
        assert_eq!(sanitize_output_name("demo board", "png"), "demo_board.png");
        assert_eq!(sanitize_output_name("clip.mp4", "mp4"), "clip.mp4");
    }

    #[test]
    fn write_frame_pdf_generates_pdf_header() {
        let frame = RgbaImage::from_pixel(4, 2, Rgba([255, 255, 255, 255]));
        let output_path = std::env::temp_dir().join(format!(
            "futsal-export-{}.pdf",
            std::process::id()
        ));

        write_frame_pdf(&frame, &output_path).expect("pdf export should succeed");
        let pdf_bytes = fs::read(&output_path).expect("pdf should be readable");
        assert!(pdf_bytes.starts_with(b"%PDF-1.4"));

        let _ = fs::remove_file(output_path);
    }
}
