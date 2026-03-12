use futsal_tactical_offline_lib::models::TacticalProjectPayload;
use futsal_tactical_offline_lib::renderer::render_project_frame_at;
use std::fs;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.len() != 6 {
        let binary = args
            .first()
            .map(String::as_str)
            .unwrap_or("render_frame_snapshot");
        return Err(format!(
            "usage: {binary} <project-json> <width> <height> <timestamp-ms> <output-png>"
        ));
    }

    let project_path = PathBuf::from(&args[1]);
    let width = parse_u32_arg(&args[2], "width")?;
    let height = parse_u32_arg(&args[3], "height")?;
    let timestamp_ms = parse_u64_arg(&args[4], "timestamp-ms")?;
    let output_path = PathBuf::from(&args[5]);

    let project_json = fs::read_to_string(&project_path)
        .map_err(|error| format!("failed to read {}: {error}", project_path.display()))?;
    let project: TacticalProjectPayload = serde_json::from_str(&project_json)
        .map_err(|error| format!("failed to parse fixture JSON: {error}"))?;

    let frame = render_project_frame_at(&project, width, height, timestamp_ms)
        .map_err(|error| format!("failed to render frame: {error}"))?;

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create output directory {}: {error}",
                parent.display()
            )
        })?;
    }

    frame
        .save(&output_path)
        .map_err(|error| format!("failed to write {}: {error}", output_path.display()))?;

    Ok(())
}

fn parse_u32_arg(value: &str, label: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|error| format!("invalid {label} value '{value}': {error}"))
}

fn parse_u64_arg(value: &str, label: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|error| format!("invalid {label} value '{value}': {error}"))
}
