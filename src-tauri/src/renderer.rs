use crate::models::{KeyframePayload, ScenePayload, TacticalProjectPayload};
use ab_glyph::{FontArc, PxScale};
use image::imageops::{crop_imm, overlay, resize, FilterType};
use image::{ImageError, Rgba, RgbaImage};
use imageproc::drawing::{
    draw_filled_circle_mut, draw_filled_rect_mut, draw_hollow_circle_mut, draw_hollow_rect_mut,
    draw_line_segment_mut, draw_polygon_mut, draw_text_mut, text_size,
};
use imageproc::point::Point;
use imageproc::rect::Rect;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use std::f32::consts::PI;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RendererError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("image error: {0}")]
    Image(#[from] ImageError),
    #[error("render canceled")]
    Canceled,
    #[error("rendering error: {0}")]
    Invalid(String),
}

pub struct RenderSequenceResult {
    pub frame_input_pattern: String,
    pub frames_dir: PathBuf,
}

#[derive(Debug, Clone, Copy)]
enum CourtType {
    Full,
    HalfAttacking,
    HalfDefending,
}

const LOGICAL_RENDER_WIDTH: u32 = 1000;
const LOGICAL_RENDER_HEIGHT: u32 = 500;
const EXPORT_FONT_BYTES: &[u8] = include_bytes!("../assets/fonts/SourceSans3-Semibold.ttf");

#[derive(Debug, Clone, Copy)]
struct RenderViewport {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDrawableStyle {
    stroke: Option<String>,
    fill: Option<String>,
    opacity: Option<f32>,
    stroke_width: Option<f32>,
    dashed: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDrawable {
    #[serde(rename = "type")]
    drawable_type: Option<String>,
    x: Option<f32>,
    y: Option<f32>,
    x2: Option<f32>,
    y2: Option<f32>,
    rotation: Option<f32>,
    width: Option<f32>,
    height: Option<f32>,
    label: Option<String>,
    style: Option<RawDrawableStyle>,
}

#[derive(Debug, Clone)]
struct RenderDrawable {
    drawable_type: String,
    x: f32,
    y: f32,
    x2: Option<f32>,
    y2: Option<f32>,
    rotation: f32,
    width: f32,
    height: f32,
    label: Option<String>,
    style: RenderStyle,
}

#[derive(Debug, Clone)]
struct RenderStyle {
    stroke: Rgba<u8>,
    fill: Rgba<u8>,
    stroke_width: i32,
    dashed: bool,
}

#[derive(Debug, Clone)]
struct SceneWindow {
    scene: ScenePayload,
    keyframes: Vec<KeyframePayload>,
    start_ms: f32,
    end_ms: f32,
}

pub fn render_project_sequence(
    project: &TacticalProjectPayload,
    width: u32,
    height: u32,
    fps: u32,
    duration_ms: u64,
    output_dir: &Path,
) -> Result<RenderSequenceResult, RendererError> {
    render_project_sequence_with_progress(project, width, height, fps, duration_ms, output_dir, |_, _| {
        Ok(())
    })
}

pub fn render_project_sequence_with_progress<F>(
    project: &TacticalProjectPayload,
    width: u32,
    height: u32,
    fps: u32,
    duration_ms: u64,
    output_dir: &Path,
    mut on_frame_rendered: F,
) -> Result<RenderSequenceResult, RendererError>
where
    F: FnMut(usize, usize) -> Result<(), RendererError>,
{
    if width == 0 || height == 0 {
        return Err(RendererError::Invalid(
            "render size must have width and height greater than zero".to_string(),
        ));
    }

    if fps == 0 {
        return Err(RendererError::Invalid("fps must be > 0".to_string()));
    }

    let scene_windows = build_scene_windows(project)?;
    let total_duration_ms = scene_windows
        .iter()
        .map(|window| window.scene.duration_ms as u64)
        .sum::<u64>()
        .max(1);

    let target_duration_ms = duration_ms.min(total_duration_ms).max(1);
    let frame_count = (((target_duration_ms as f32 / 1000.0) * fps as f32).ceil() as usize).max(1);
    let court_type = parse_court_type(project);

    if output_dir.exists() {
        std::fs::remove_dir_all(output_dir)?;
    }
    std::fs::create_dir_all(output_dir)?;

    for frame_index in 0..frame_count {
        let timestamp_ms = (frame_index as f32 / fps as f32) * 1000.0;
        let scene_window = find_scene_window(&scene_windows, timestamp_ms);
        let local_timestamp_ms = (timestamp_ms - scene_window.start_ms)
            .clamp(0.0, scene_window.scene.duration_ms as f32);
        let drawables = sample_scene_drawables(scene_window, local_timestamp_ms);
        let frame_image = render_frame(width, height, court_type, &drawables);
        let frame_path = output_dir.join(format!("frame_{:06}.png", frame_index + 1));
        frame_image.save(frame_path)?;
        on_frame_rendered(frame_index + 1, frame_count)?;
    }

    let frame_input_pattern = output_dir.join("frame_%06d.png").to_string_lossy().to_string();
    Ok(RenderSequenceResult {
        frame_input_pattern,
        frames_dir: output_dir.to_path_buf(),
    })
}

pub fn render_project_frame_at(
    project: &TacticalProjectPayload,
    width: u32,
    height: u32,
    timestamp_ms: u64,
) -> Result<RgbaImage, RendererError> {
    if width == 0 || height == 0 {
        return Err(RendererError::Invalid(
            "render size must have width and height greater than zero".to_string(),
        ));
    }

    let scene_windows = build_scene_windows(project)?;
    let total_duration_ms = scene_windows
        .iter()
        .map(|window| window.scene.duration_ms as u64)
        .sum::<u64>()
        .max(1);
    let clamped_timestamp = timestamp_ms.min(total_duration_ms) as f32;
    let scene_window = find_scene_window(&scene_windows, clamped_timestamp);
    let local_timestamp_ms =
        (clamped_timestamp - scene_window.start_ms).clamp(0.0, scene_window.scene.duration_ms as f32);
    let drawables = sample_scene_drawables(scene_window, local_timestamp_ms);
    let court_type = parse_court_type(project);
    Ok(render_frame(width, height, court_type, &drawables))
}

fn parse_court_type(project: &TacticalProjectPayload) -> CourtType {
    match project.meta.court_type.as_deref() {
        Some("half") | Some("half-attacking") => CourtType::HalfAttacking,
        Some("half-defending") => CourtType::HalfDefending,
        _ => CourtType::Full,
    }
}

fn build_scene_windows(project: &TacticalProjectPayload) -> Result<Vec<SceneWindow>, RendererError> {
    if project.scenes.is_empty() {
        return Err(RendererError::Invalid(
            "project has no scenes to render".to_string(),
        ));
    }

    let mut scenes = project.scenes.clone();
    scenes.sort_by_key(|scene| scene.order_index);

    let mut scene_windows = Vec::with_capacity(scenes.len());
    let mut cursor = 0.0_f32;

    for scene in scenes {
        let mut keyframes = project
            .keyframes
            .iter()
            .filter(|keyframe| keyframe.scene_id == scene.id)
            .cloned()
            .collect::<Vec<_>>();
        keyframes.sort_by_key(|keyframe| keyframe.timestamp_ms);

        if keyframes.is_empty() {
            return Err(RendererError::Invalid(format!(
                "scene {} has no keyframes",
                scene.id
            )));
        }

        let start_ms = cursor;
        let end_ms = start_ms + scene.duration_ms as f32;
        scene_windows.push(SceneWindow {
            scene,
            keyframes,
            start_ms,
            end_ms,
        });
        cursor = end_ms;
    }

    Ok(scene_windows)
}

fn find_scene_window<'a>(scene_windows: &'a [SceneWindow], timestamp_ms: f32) -> &'a SceneWindow {
    for scene_window in scene_windows {
        if timestamp_ms < scene_window.end_ms {
            return scene_window;
        }
    }
    scene_windows
        .last()
        .expect("scene_windows must contain at least one scene")
}

fn sample_scene_drawables(scene_window: &SceneWindow, timestamp_ms: f32) -> Vec<RenderDrawable> {
    let keyframes = &scene_window.keyframes;

    if keyframes.len() == 1 {
        return parse_drawable_state(&keyframes[0].drawable_state)
            .into_values()
            .collect::<Vec<_>>();
    }

    let mut lower = &keyframes[0];
    let mut upper = &keyframes[keyframes.len() - 1];

    for index in 0..(keyframes.len() - 1) {
        let current = &keyframes[index];
        let next = &keyframes[index + 1];
        let current_time = current.timestamp_ms as f32;
        let next_time = next.timestamp_ms as f32;

        if timestamp_ms <= current_time {
            lower = current;
            upper = current;
            break;
        }

        if timestamp_ms >= current_time && timestamp_ms <= next_time {
            lower = current;
            upper = next;
            break;
        }
    }

    let lower_map = parse_drawable_state(&lower.drawable_state);
    let upper_map = parse_drawable_state(&upper.drawable_state);
    interpolate_drawable_states(lower, upper, timestamp_ms, &lower_map, &upper_map)
}

fn parse_drawable_state(drawable_state: &Value) -> HashMap<String, RenderDrawable> {
    let parsed = serde_json::from_value::<HashMap<String, RawDrawable>>(drawable_state.clone());
    let Ok(map) = parsed else {
        return HashMap::new();
    };

    map.into_iter()
        .map(|(id, drawable)| {
            let drawable_type = drawable
                .drawable_type
                .unwrap_or_else(|| "player".to_string());
            let default_dimensions = default_dimensions(&drawable_type);
            let style = drawable.style.unwrap_or(RawDrawableStyle {
                stroke: None,
                fill: None,
                opacity: Some(1.0),
                stroke_width: Some(default_stroke_width(&drawable_type)),
                dashed: Some(false),
            });

            let opacity = style.opacity.unwrap_or(1.0).clamp(0.0, 1.0);
            let fill = parse_hex_color(style.fill.as_deref(), fallback_fill_color(&drawable_type), opacity);
            let stroke =
                parse_hex_color(style.stroke.as_deref(), fallback_stroke_color(&drawable_type), opacity);
            let stroke_width = style
                .stroke_width
                .unwrap_or_else(|| default_stroke_width(&drawable_type))
                .max(1.0)
                .round() as i32;

            let render_drawable = RenderDrawable {
                drawable_type,
                x: drawable.x.unwrap_or(0.0),
                y: drawable.y.unwrap_or(0.0),
                x2: drawable.x2,
                y2: drawable.y2,
                rotation: drawable.rotation.unwrap_or(0.0),
                width: drawable.width.unwrap_or(default_dimensions.0),
                height: drawable.height.unwrap_or(default_dimensions.1),
                label: drawable.label,
                style: RenderStyle {
                    stroke,
                    fill,
                    stroke_width,
                    dashed: style.dashed.unwrap_or(false),
                },
            };
            (id, render_drawable)
        })
        .collect::<HashMap<_, _>>()
}

fn fallback_fill_color(drawable_type: &str) -> [u8; 3] {
    match drawable_type {
        "player" => [45, 106, 79],
        "goalkeeper" => [239, 71, 111],
        "ball" => [248, 250, 252],
        "cone" => [255, 154, 31],
        "zone" => [245, 158, 11],
        "arrow" | "line" => [56, 189, 248],
        "label" => [15, 118, 110],
        _ => [60, 130, 220],
    }
}

fn fallback_stroke_color(drawable_type: &str) -> [u8; 3] {
    match drawable_type {
        "zone" => [180, 83, 9],
        "arrow" | "line" => [12, 74, 110],
        "cone" => [122, 63, 9],
        _ => [17, 24, 39],
    }
}

fn default_stroke_width(drawable_type: &str) -> f32 {
    match drawable_type {
        "arrow" | "line" => 3.0,
        "zone" => 2.0,
        _ => 2.0,
    }
}

fn default_dimensions(drawable_type: &str) -> (f32, f32) {
    match drawable_type {
        "player" | "goalkeeper" => (24.0, 24.0),
        "ball" => (12.0, 12.0),
        "cone" => (14.0, 14.0),
        "zone" => (120.0, 70.0),
        "arrow" | "line" => (80.0, 0.0),
        "label" => (0.0, 0.0),
        _ => (0.0, 0.0),
    }
}

fn interpolate_drawable_states(
    lower: &KeyframePayload,
    upper: &KeyframePayload,
    timestamp_ms: f32,
    lower_map: &HashMap<String, RenderDrawable>,
    upper_map: &HashMap<String, RenderDrawable>,
) -> Vec<RenderDrawable> {
    let lower_time = lower.timestamp_ms as f32;
    let upper_time = upper.timestamp_ms as f32;
    let t = if (upper_time - lower_time).abs() <= f32::EPSILON {
        0.0
    } else {
        ((timestamp_ms - lower_time) / (upper_time - lower_time)).clamp(0.0, 1.0)
    };

    let mut ids = BTreeSet::new();
    ids.extend(lower_map.keys().cloned());
    ids.extend(upper_map.keys().cloned());

    let mut output = Vec::with_capacity(ids.len());

    for id in ids {
        let lower_drawable = lower_map.get(&id);
        let upper_drawable = upper_map.get(&id);
        match (lower_drawable, upper_drawable) {
            (Some(a), Some(b)) => {
                output.push(RenderDrawable {
                    drawable_type: a.drawable_type.clone(),
                    x: lerp(a.x, b.x, t),
                    y: lerp(a.y, b.y, t),
                    x2: blend_optional(a.x2, b.x2, t),
                    y2: blend_optional(a.y2, b.y2, t),
                    rotation: lerp(a.rotation, b.rotation, t),
                    width: lerp(a.width, b.width, t),
                    height: lerp(a.height, b.height, t),
                    label: a.label.clone().or_else(|| b.label.clone()),
                    style: interpolate_style(&a.style, &b.style, t),
                });
            }
            (Some(a), None) => output.push(a.clone()),
            (None, Some(b)) => output.push(b.clone()),
            (None, None) => {}
        }
    }

    output.sort_by_key(drawable_priority);
    output
}

fn interpolate_style(a: &RenderStyle, b: &RenderStyle, t: f32) -> RenderStyle {
    RenderStyle {
        stroke: lerp_color(a.stroke, b.stroke, t),
        fill: lerp_color(a.fill, b.fill, t),
        stroke_width: lerp(a.stroke_width as f32, b.stroke_width as f32, t)
            .round()
            .max(1.0) as i32,
        dashed: if t < 0.5 { a.dashed } else { b.dashed },
    }
}

fn render_frame(width: u32, height: u32, court_type: CourtType, drawables: &[RenderDrawable]) -> RgbaImage {
    let render_scale = resolve_render_scale(court_type, width, height);
    let scaled_world_width = ((LOGICAL_RENDER_WIDTH as f32) * render_scale)
        .round()
        .max(1.0) as u32;
    let scaled_world_height = ((LOGICAL_RENDER_HEIGHT as f32) * render_scale)
        .round()
        .max(1.0) as u32;
    let mut image = RgbaImage::new(scaled_world_width, scaled_world_height);
    draw_pitch_background(&mut image);
    draw_full_court(&mut image);
    let scaled_drawables = scale_drawables(drawables, render_scale);

    for drawable in &scaled_drawables {
        draw_drawable(&mut image, drawable);
    }

    match court_type {
        CourtType::Full => {
            if image.width() == width && image.height() == height {
                image
            } else {
                resize(&image, width, height, FilterType::Lanczos3)
            }
        }
        CourtType::HalfAttacking | CourtType::HalfDefending => {
            let viewport = resolve_scaled_world_viewport(court_type, render_scale);
            let focused_image = crop_imm(&image, viewport.x, viewport.y, viewport.width, viewport.height).to_image();
            let square_size = width.min(height).max(1);
            let scaled = if focused_image.width() == square_size && focused_image.height() == square_size {
                focused_image
            } else {
                resize(&focused_image, square_size, square_size, FilterType::Lanczos3)
            };
            let mut framed = RgbaImage::from_pixel(width, height, RUNOFF_COLOR);
            let offset_x = ((width - square_size) / 2) as i64;
            let offset_y = ((height - square_size) / 2) as i64;
            overlay(&mut framed, &scaled, offset_x, offset_y);
            framed
        }
    }
}

fn resolve_render_scale(court_type: CourtType, width: u32, height: u32) -> f32 {
    match court_type {
        CourtType::Full => {
            let scale_x = width as f32 / LOGICAL_RENDER_WIDTH as f32;
            let scale_y = height as f32 / LOGICAL_RENDER_HEIGHT as f32;
            scale_x.max(scale_y).max(1.0)
        }
        CourtType::HalfAttacking | CourtType::HalfDefending => {
            let square_size = width.min(height).max(1) as f32;
            (square_size / (LOGICAL_RENDER_WIDTH as f32 * 0.5)).max(1.0)
        }
    }
}

fn resolve_scaled_world_viewport(court_type: CourtType, scale: f32) -> RenderViewport {
    let viewport = resolve_world_viewport(court_type);
    RenderViewport {
        x: ((viewport.x as f32) * scale).round() as u32,
        y: ((viewport.y as f32) * scale).round() as u32,
        width: ((viewport.width as f32) * scale).round().max(1.0) as u32,
        height: ((viewport.height as f32) * scale).round().max(1.0) as u32,
    }
}

fn scale_drawables(drawables: &[RenderDrawable], scale: f32) -> Vec<RenderDrawable> {
    drawables
        .iter()
        .map(|drawable| RenderDrawable {
            drawable_type: drawable.drawable_type.clone(),
            x: drawable.x * scale,
            y: drawable.y * scale,
            x2: drawable.x2.map(|value| value * scale),
            y2: drawable.y2.map(|value| value * scale),
            rotation: drawable.rotation,
            width: drawable.width * scale,
            height: drawable.height * scale,
            label: drawable.label.clone(),
            style: RenderStyle {
                stroke: drawable.style.stroke,
                fill: drawable.style.fill,
                stroke_width: ((drawable.style.stroke_width as f32) * scale)
                    .round()
                    .max(1.0) as i32,
                dashed: drawable.style.dashed,
            },
        })
        .collect()
}

fn resolve_world_viewport(court_type: CourtType) -> RenderViewport {
    match court_type {
        CourtType::HalfAttacking => RenderViewport {
            x: LOGICAL_RENDER_WIDTH / 2,
            y: 0,
            width: LOGICAL_RENDER_WIDTH / 2,
            height: LOGICAL_RENDER_HEIGHT,
        },
        CourtType::HalfDefending => RenderViewport {
            x: 0,
            y: 0,
            width: LOGICAL_RENDER_WIDTH / 2,
            height: LOGICAL_RENDER_HEIGHT,
        },
        CourtType::Full => RenderViewport {
            x: 0,
            y: 0,
            width: LOGICAL_RENDER_WIDTH,
            height: LOGICAL_RENDER_HEIGHT,
        },
    }
}

const RUNOFF_COLOR: Rgba<u8> = Rgba([164, 95, 40, 255]);
const SURFACE_COLOR: Rgba<u8> = Rgba([19, 136, 184, 255]);
const LINE_COLOR: Rgba<u8> = Rgba([248, 252, 255, 255]);

fn draw_pitch_background(canvas: &mut RgbaImage) {
    let width = canvas.width();
    let height = canvas.height();
    if let Some(rect) = rect_from_points(0.0, 0.0, width as f32, height as f32) {
        draw_filled_rect_mut(canvas, rect, RUNOFF_COLOR);
    }
}

fn draw_full_court(canvas: &mut RgbaImage) {
    let line_thickness = scaled_thickness(canvas, 2);
    let spot_radius = scaled_radius(canvas, 4);
    let center_dot_radius = scaled_radius(canvas, 3);
    let width = canvas.width() as f32;
    let height = canvas.height() as f32;
    let margin = width.min(height) * 0.03;
    let left = margin;
    let top = margin;
    let right = width - margin;
    let bottom = height - margin;
    let line_color = LINE_COLOR;
    let surface_color = SURFACE_COLOR;
    let unit = ((right - left) / 40.0).min((bottom - top) / 20.0);
    let center_x = width * 0.5;
    let center_y = height * 0.5;
    let center_radius = (3.0 * unit).round() as i32;
    let penalty_dist = 6.0 * unit;
    let second_penalty_dist = 10.0 * unit;
    let goal_depth = 1.0 * unit;
    let goal_width = 3.0 * unit;
    let corner_radius = (0.25 * unit).max(2.0).round() as i32;
    if let Some(surface) = rect_from_points(left, top, right, bottom) {
        draw_filled_rect_mut(canvas, surface, surface_color);
    }

    if let Some(outer) = rect_from_points(left, top, right, bottom) {
        draw_hollow_rect_mut(canvas, outer, line_color);
    }

    draw_styled_line(
        canvas,
        (center_x, top),
        (center_x, bottom),
        line_color,
        line_thickness,
        false,
    );

    draw_filled_circle_mut(
        canvas,
        (center_x.round() as i32, center_y.round() as i32),
        center_dot_radius,
        line_color,
    );
    draw_hollow_circle_mut(
        canvas,
        (center_x.round() as i32, center_y.round() as i32),
        center_radius,
        line_color,
    );

    draw_futsal_penalty_area(canvas, true, left, right, top, bottom, unit, line_color);
    draw_futsal_penalty_area(canvas, false, left, right, top, bottom, unit, line_color);

    let left_mark = (left + penalty_dist, center_y);
    let right_mark = (right - penalty_dist, center_y);
    let left_second_mark = (left + second_penalty_dist, center_y);
    let right_second_mark = (right - second_penalty_dist, center_y);
    draw_filled_circle_mut(
        canvas,
        (left_mark.0.round() as i32, left_mark.1.round() as i32),
        spot_radius,
        line_color,
    );
    draw_filled_circle_mut(
        canvas,
        (right_mark.0.round() as i32, right_mark.1.round() as i32),
        spot_radius,
        line_color,
    );
    draw_filled_circle_mut(
        canvas,
        (left_second_mark.0.round() as i32, left_second_mark.1.round() as i32),
        spot_radius,
        line_color,
    );
    draw_filled_circle_mut(
        canvas,
        (right_second_mark.0.round() as i32, right_second_mark.1.round() as i32),
        spot_radius,
        line_color,
    );

    draw_outline_rect_thick(
        canvas,
        left - goal_depth,
        center_y - goal_width * 0.5,
        left,
        center_y + goal_width * 0.5,
        line_color,
        line_thickness,
    );
    draw_outline_rect_thick(
        canvas,
        right,
        center_y - goal_width * 0.5,
        right + goal_depth,
        center_y + goal_width * 0.5,
        line_color,
        line_thickness,
    );

    draw_arc(canvas, (left, top), corner_radius, 0.0, 90.0, line_color, line_thickness);
    draw_arc(canvas, (left, bottom), corner_radius, -90.0, 0.0, line_color, line_thickness);
    draw_arc(canvas, (right, top), corner_radius, 90.0, 180.0, line_color, line_thickness);
    draw_arc(canvas, (right, bottom), corner_radius, 180.0, 270.0, line_color, line_thickness);

    draw_substitution_marks(canvas, left, right, bottom, unit, line_color);
    draw_goal_line_distance_marks(canvas, left, right, top, bottom, unit, line_color, true, true);
}

fn draw_futsal_penalty_area(
    canvas: &mut RgbaImage,
    is_left: bool,
    left: f32,
    right: f32,
    top: f32,
    bottom: f32,
    unit: f32,
    line_color: Rgba<u8>,
) {
    let line_thickness = scaled_thickness(canvas, 2);
    let center_y = (top + bottom) * 0.5;
    let goal_width = 3.0 * unit;
    let penalty_radius = 6.0 * unit;
    let penalty_dist = 6.0 * unit;
    let top_post_y = center_y - goal_width * 0.5;
    let bottom_post_y = center_y + goal_width * 0.5;
    let penalty_join_half = 1.58 * unit;
    let penalty_join_top = center_y - penalty_join_half;
    let penalty_join_bottom = center_y + penalty_join_half;
    let join_x = if is_left { left + penalty_dist } else { right - penalty_dist };

    if is_left {
        let top_join_angle = ((penalty_join_top - top_post_y).atan2(join_x - left)) * (180.0 / PI);
        let bottom_join_angle =
            ((penalty_join_bottom - bottom_post_y).atan2(join_x - left)) * (180.0 / PI);
        draw_arc(
            canvas,
            (left, top_post_y),
            penalty_radius.round() as i32,
            -90.0,
            top_join_angle,
            line_color,
            line_thickness,
        );
        draw_arc(
            canvas,
            (left, bottom_post_y),
            penalty_radius.round() as i32,
            bottom_join_angle,
            90.0,
            line_color,
            line_thickness,
        );
        draw_styled_line(
            canvas,
            (join_x, penalty_join_top),
            (join_x, penalty_join_bottom),
            line_color,
            line_thickness,
            false,
        );
        return;
    }

    let top_join_angle = ((penalty_join_top - top_post_y).atan2(join_x - right)) * (180.0 / PI);
    let bottom_join_angle =
        ((penalty_join_bottom - bottom_post_y).atan2(join_x - right)) * (180.0 / PI);
    draw_arc(
        canvas,
        (right, top_post_y),
        penalty_radius.round() as i32,
        -90.0,
        top_join_angle,
        line_color,
        line_thickness,
    );
    draw_arc(
        canvas,
        (right, bottom_post_y),
        penalty_radius.round() as i32,
        90.0,
        bottom_join_angle,
        line_color,
        line_thickness,
    );
    draw_styled_line(
        canvas,
        (join_x, penalty_join_top),
        (join_x, penalty_join_bottom),
        line_color,
        line_thickness,
        false,
    );
}

fn draw_substitution_marks(
    canvas: &mut RgbaImage,
    left: f32,
    right: f32,
    bottom: f32,
    unit: f32,
    line_color: Rgba<u8>,
) {
    let line_thickness = scaled_thickness(canvas, 2);
    let center_x = (left + right) * 0.5;
    let mark_len = (0.8 * unit).max(8.0);
    let marks = [
        center_x - 10.0 * unit,
        center_x - 5.0 * unit,
        center_x + 5.0 * unit,
        center_x + 10.0 * unit,
    ];
    for mark_x in marks {
        draw_styled_line(
            canvas,
            (mark_x, bottom - mark_len * 0.5),
            (mark_x, bottom + mark_len * 0.5),
            line_color,
            line_thickness,
            false,
        );
    }
}

fn draw_goal_line_distance_marks(
    canvas: &mut RgbaImage,
    left: f32,
    right: f32,
    top: f32,
    bottom: f32,
    unit: f32,
    line_color: Rgba<u8>,
    draw_left: bool,
    draw_right: bool,
) {
    let line_thickness = scaled_thickness(canvas, 2);
    let offset = 5.0 * unit;
    let mark_len = (0.6 * unit).max(8.0);
    let marks_y = [top + offset, bottom - offset];
    for mark_y in marks_y {
        if draw_left {
            draw_styled_line(
                canvas,
                (left - mark_len * 0.5, mark_y),
                (left + mark_len * 0.5, mark_y),
                line_color,
                line_thickness,
                false,
            );
        }
        if draw_right {
            draw_styled_line(
                canvas,
                (right - mark_len * 0.5, mark_y),
                (right + mark_len * 0.5, mark_y),
                line_color,
                line_thickness,
                false,
            );
        }
    }
}

fn draw_arc(
    canvas: &mut RgbaImage,
    center: (f32, f32),
    radius: i32,
    start_deg: f32,
    end_deg: f32,
    color: Rgba<u8>,
    thickness: i32,
) {
    let sweep = (end_deg - start_deg).abs().max(1.0);
    let steps = (sweep * 2.0).ceil() as i32;

    for segment in 0..steps {
        let t0 = segment as f32 / steps as f32;
        let t1 = (segment + 1) as f32 / steps as f32;
        let angle0 = (start_deg + (end_deg - start_deg) * t0) * (PI / 180.0);
        let angle1 = (start_deg + (end_deg - start_deg) * t1) * (PI / 180.0);

        let p0 = (
            center.0 + radius as f32 * angle0.cos(),
            center.1 + radius as f32 * angle0.sin(),
        );
        let p1 = (
            center.0 + radius as f32 * angle1.cos(),
            center.1 + radius as f32 * angle1.sin(),
        );
        draw_styled_line(canvas, p0, p1, color, thickness, false);
    }
}

fn draw_drawable(canvas: &mut RgbaImage, drawable: &RenderDrawable) {
    match drawable.drawable_type.as_str() {
        "zone" => draw_zone(canvas, drawable),
        "line" => draw_connection(canvas, drawable, false),
        "arrow" => draw_connection(canvas, drawable, true),
        "label" => draw_label_tag(canvas, drawable),
        "cone" => draw_cone(canvas, drawable),
        "ball" => draw_ball(canvas, drawable),
        "goalkeeper" => draw_player(canvas, drawable, true),
        "player" => draw_player(canvas, drawable, false),
        _ => draw_player(canvas, drawable, false),
    }
}

fn draw_zone(canvas: &mut RgbaImage, drawable: &RenderDrawable) {
    let (x1, y1, x2, y2) = line_endpoints(drawable);
    if let Some(rect) = rect_from_points(x1, y1, x2, y2) {
        draw_filled_rect_mut(canvas, rect, drawable.style.fill);
        draw_outline_rect_thick(
            canvas,
            x1,
            y1,
            x2,
            y2,
            drawable.style.stroke,
            drawable.style.stroke_width,
        );

        if let Some(label) = drawable.label.as_deref() {
            let label_padding = scaled_padding(canvas, 4);
            let text_scale = scaled_font_size(canvas, 12.0);
            draw_text_bitmap(
                canvas,
                label,
                rect.left() + label_padding,
                rect.top() + label_padding,
                contrasting_text_color(drawable.style.fill),
                text_scale,
            );
        }
    }
}

fn draw_connection(canvas: &mut RgbaImage, drawable: &RenderDrawable, with_arrow_head: bool) {
    let start = (drawable.x, drawable.y);
    let end = if let (Some(x2), Some(y2)) = (drawable.x2, drawable.y2) {
        (x2, y2)
    } else {
        (drawable.x + drawable.width, drawable.y + drawable.height)
    };
    let is_dribble = is_dribble_style(drawable);

    if is_dribble {
        let accent = with_alpha(
            lerp_color(drawable.style.stroke, Rgba([38, 23, 8, 255]), 0.72),
            drawable.style.stroke[3].saturating_mul(3) / 4,
        );
        let points = build_dribble_wave_points(start, end, drawable.style.stroke_width.max(3));
        draw_polyline(
            canvas,
            &points,
            accent,
            drawable.style.stroke_width.max(3) + 2,
        );
        draw_polyline(
            canvas,
            &points,
            drawable.style.stroke,
            drawable.style.stroke_width.max(3),
        );
    } else {
        draw_styled_line(
            canvas,
            start,
            end,
            drawable.style.stroke,
            drawable.style.stroke_width,
            drawable.style.dashed,
        );
    }

    if with_arrow_head {
        if is_dribble {
            draw_arrow_head(
                canvas,
                start,
                end,
                with_alpha(
                    lerp_color(drawable.style.stroke, Rgba([38, 23, 8, 255]), 0.72),
                    drawable.style.stroke[3].saturating_mul(3) / 4,
                ),
                drawable.style.stroke_width + 2,
            );
        }
        draw_arrow_head(canvas, start, end, drawable.style.stroke, drawable.style.stroke_width);
    }

    if let Some(label) = drawable.label.as_deref() {
        let text_x = ((start.0 + end.0) * 0.5).round() as i32;
        let text_y = ((start.1 + end.1) * 0.5 - scaled_length(canvas, 4.0)).round() as i32;
        draw_text_bitmap(
            canvas,
            label,
            text_x,
            text_y,
            drawable.style.stroke,
            scaled_font_size(canvas, 11.0),
        );
    }
}

fn draw_player(canvas: &mut RgbaImage, drawable: &RenderDrawable, is_goalkeeper: bool) {
    let center = (drawable.x.round() as i32, drawable.y.round() as i32);
    let radius = resolve_player_radius(drawable);

    let fill = if is_goalkeeper {
        lerp_color(drawable.style.fill, Rgba([239, 71, 111, 255]), 0.35)
    } else {
        drawable.style.fill
    };

    draw_filled_circle_mut(canvas, center, radius, fill);

    let outline_passes = drawable.style.stroke_width.max(1);
    for offset in 0..outline_passes {
        draw_hollow_circle_mut(canvas, center, radius + offset, drawable.style.stroke);
    }

    let angle = drawable.rotation.to_radians();
    let marker_end = (
        center.0 as f32 + angle.cos() * radius as f32,
        center.1 as f32 + angle.sin() * radius as f32,
    );
    draw_styled_line(
        canvas,
        (center.0 as f32, center.1 as f32),
        marker_end,
        drawable.style.stroke,
        scaled_thickness(canvas, 1),
        false,
    );

    if let Some(label) = drawable.label.as_deref() {
        draw_centered_text(
            canvas,
            label,
            center,
            contrasting_text_color(fill),
            scaled_font_size(canvas, 12.0),
        );
    }
}

fn draw_ball(canvas: &mut RgbaImage, drawable: &RenderDrawable) {
    let center = (drawable.x.round() as i32, drawable.y.round() as i32);
    let radius = resolve_ball_radius(drawable);
    let fill = Rgba([251, 253, 255, drawable.style.fill[3]]);
    let seam = Rgba([22, 35, 52, drawable.style.stroke[3]]);
    let shadow = with_alpha(Rgba([8, 19, 31, 255]), drawable.style.fill[3] / 7);
    let ring_thickness = drawable.style.stroke_width.max(2);
    let pentagon = build_regular_polygon_points(
        drawable.x,
        drawable.y,
        (radius as f32 * 0.34).max(1.5),
        5,
        -PI * 0.5,
    );

    draw_filled_circle_mut(
        canvas,
        (
            (drawable.x + radius as f32 * 0.18).round() as i32,
            (drawable.y + radius as f32 * 0.16).round() as i32,
        ),
        radius,
        shadow,
    );
    draw_filled_circle_mut(canvas, center, radius, fill);
    for offset in 0..ring_thickness {
        draw_hollow_circle_mut(canvas, center, radius + offset, seam);
    }
    draw_polygon_mut(canvas, &pentagon, seam);
    if radius >= 5 {
        for point in &pentagon {
            let angle = (point.y as f32 - drawable.y).atan2(point.x as f32 - drawable.x);
            let seam_start = (
                drawable.x + angle.cos() * radius as f32 * 0.46,
                drawable.y + angle.sin() * radius as f32 * 0.46,
            );
            let seam_end = (
                drawable.x + angle.cos() * radius as f32 * 0.83,
                drawable.y + angle.sin() * radius as f32 * 0.83,
            );
            draw_thick_line(canvas, seam_start, seam_end, seam, ((radius as f32 * 0.16).max(1.5)).round() as i32);
        }
    }
    draw_filled_circle_mut(
        canvas,
        (
            (drawable.x - radius as f32 * 0.28).round() as i32,
            (drawable.y - radius as f32 * 0.26).round() as i32,
        ),
        ((radius as f32 * 0.16).max(1.0)).round() as i32,
        with_alpha(Rgba([255, 255, 255, 255]), drawable.style.fill[3].saturating_mul(17) / 20),
    );
}

fn resolve_player_radius(drawable: &RenderDrawable) -> i32 {
    let diameter = drawable
        .width
        .max(drawable.height)
        .min(24.0)
        .max(18.0);
    (diameter * 0.5).round() as i32
}

fn resolve_ball_radius(drawable: &RenderDrawable) -> i32 {
    let diameter = drawable
        .width
        .max(drawable.height)
        .min(12.0)
        .max(10.0);
    (diameter * 0.5).round() as i32
}

fn draw_cone(canvas: &mut RgbaImage, drawable: &RenderDrawable) {
    let size = drawable.width.max(drawable.height).max(14.0);
    let height = size * 1.18;
    let body = build_cone_body_points(drawable.x, drawable.y, size, height);
    let band = build_cone_band_points(&body, 0.58, 0.8);
    let highlight = build_cone_highlight_points(drawable.x, drawable.y, size, height);

    draw_polygon_mut(canvas, &body, drawable.style.fill);
    draw_polygon_mut(
        canvas,
        &highlight,
        lerp_color(drawable.style.fill, Rgba([255, 242, 199, drawable.style.fill[3]]), 0.32),
    );
    draw_polygon_mut(
        canvas,
        &band,
        lerp_color(drawable.style.fill, Rgba([154, 77, 16, drawable.style.fill[3]]), 0.45),
    );
    draw_polygon_outline(canvas, &body, drawable.style.stroke, drawable.style.stroke_width.max(1));
}

fn draw_label_tag(canvas: &mut RgbaImage, drawable: &RenderDrawable) {
    let text = drawable
        .label
        .as_deref()
        .unwrap_or("Label")
        .trim()
        .to_string();
    if text.is_empty() {
        return;
    }

    let scale = scaled_font_size(canvas, 12.0);
    let (text_width, text_height) = measure_text(&text, scale);
    let padding = scaled_padding(canvas, 4);
    let left = drawable.x.round() as i32;
    let top = drawable.y.round() as i32;
    let right = left + text_width as i32 + padding * 2;
    let bottom = top + text_height as i32 + padding * 2;

    if let Some(rect) = rect_from_points(left as f32, top as f32, right as f32, bottom as f32) {
        draw_filled_rect_mut(canvas, rect, drawable.style.fill);
        draw_outline_rect_thick(
            canvas,
            left as f32,
            top as f32,
            right as f32,
            bottom as f32,
            drawable.style.stroke,
            drawable.style.stroke_width,
        );
        draw_text_bitmap(
            canvas,
            &text,
            left + padding,
            top + padding,
            contrasting_text_color(drawable.style.fill),
            scale,
        );
    }
}

fn draw_outline_rect_thick(
    canvas: &mut RgbaImage,
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
    color: Rgba<u8>,
    thickness: i32,
) {
    draw_styled_line(canvas, (left, top), (right, top), color, thickness, false);
    draw_styled_line(canvas, (right, top), (right, bottom), color, thickness, false);
    draw_styled_line(canvas, (right, bottom), (left, bottom), color, thickness, false);
    draw_styled_line(canvas, (left, bottom), (left, top), color, thickness, false);
}

fn draw_styled_line(
    canvas: &mut RgbaImage,
    start: (f32, f32),
    end: (f32, f32),
    color: Rgba<u8>,
    thickness: i32,
    dashed: bool,
) {
    if dashed {
        draw_dashed_line(canvas, start, end, color, thickness.max(1));
    } else {
        draw_thick_line(canvas, start, end, color, thickness.max(1));
    }
}

fn draw_dashed_line(
    canvas: &mut RgbaImage,
    start: (f32, f32),
    end: (f32, f32),
    color: Rgba<u8>,
    thickness: i32,
) {
    let dash = scaled_length(canvas, 16.0);
    let gap = scaled_length(canvas, 10.0);
    let dx = end.0 - start.0;
    let dy = end.1 - start.1;
    let distance = (dx * dx + dy * dy).sqrt();
    if distance <= f32::EPSILON {
        return;
    }

    let mut cursor = 0.0_f32;

    while cursor < distance {
        let segment_start = cursor;
        let segment_end = (cursor + dash).min(distance);
        let t0 = segment_start / distance;
        let t1 = segment_end / distance;
        let p0 = (start.0 + dx * t0, start.1 + dy * t0);
        let p1 = (start.0 + dx * t1, start.1 + dy * t1);
        draw_thick_line(canvas, p0, p1, color, thickness);
        cursor += dash + gap;
    }
}

fn draw_thick_line(
    canvas: &mut RgbaImage,
    start: (f32, f32),
    end: (f32, f32),
    color: Rgba<u8>,
    thickness: i32,
) {
    let thickness = thickness.max(1);
    if thickness == 1 {
        draw_line_segment_mut(canvas, start, end, color);
        return;
    }

    let dx = end.0 - start.0;
    let dy = end.1 - start.1;
    let length = (dx * dx + dy * dy).sqrt();
    if length <= f32::EPSILON {
        draw_filled_circle_mut(
            canvas,
            (start.0.round() as i32, start.1.round() as i32),
            (thickness as f32 * 0.5).round() as i32,
            color,
        );
        return;
    }

    let nx = -dy / length;
    let ny = dx / length;

    for pass in 0..thickness {
        let offset = pass as f32 - (thickness as f32 - 1.0) * 0.5;
        let shifted_start = (start.0 + nx * offset, start.1 + ny * offset);
        let shifted_end = (end.0 + nx * offset, end.1 + ny * offset);
        draw_line_segment_mut(canvas, shifted_start, shifted_end, color);
    }
}

fn draw_polyline(
    canvas: &mut RgbaImage,
    points: &[(f32, f32)],
    color: Rgba<u8>,
    thickness: i32,
) {
    if points.len() < 2 {
        return;
    }

    for index in 1..points.len() {
        draw_thick_line(canvas, points[index - 1], points[index], color, thickness.max(1));
    }
}

fn build_dribble_wave_points(
    start: (f32, f32),
    end: (f32, f32),
    thickness: i32,
) -> Vec<(f32, f32)> {
    let dx = end.0 - start.0;
    let dy = end.1 - start.1;
    let distance = (dx * dx + dy * dy).sqrt();
    if distance <= f32::EPSILON {
        return Vec::new();
    }

    let unit_x = dx / distance;
    let unit_y = dy / distance;
    let normal_x = -unit_y;
    let normal_y = unit_x;
    let distance_scale = (distance / 42.0).clamp(0.7, 1.0);
    let amplitude = ((thickness as f32 * 1.15).clamp(3.25, 6.25)) * distance_scale;
    let cycles = (distance / 48.0).clamp(1.15, 4.25);
    let steps = ((distance / 6.0).ceil() as i32).max(18);
    let mut points = Vec::with_capacity((steps + 1) as usize);

    for step in 0..=steps {
        let t = step as f32 / steps as f32;
        let base = (start.0 + unit_x * distance * t, start.1 + unit_y * distance * t);
        let envelope = (PI * t).sin().powf(0.85);
        let offset = (t * PI * 2.0 * cycles).sin() * amplitude * envelope;
        points.push((base.0 + normal_x * offset, base.1 + normal_y * offset));
    }

    points
}

fn draw_arrow_head(
    canvas: &mut RgbaImage,
    start: (f32, f32),
    end: (f32, f32),
    color: Rgba<u8>,
    thickness: i32,
) {
    let dx = end.0 - start.0;
    let dy = end.1 - start.1;
    let length = (dx * dx + dy * dy).sqrt();
    if length <= 2.0 {
        return;
    }

    let angle = dy.atan2(dx);
    let head_length = scaled_length(canvas, 12.0) + (thickness as f32 * 1.4);
    let spread = 28.0_f32.to_radians();

    let left = (
        end.0 - head_length * (angle - spread).cos(),
        end.1 - head_length * (angle - spread).sin(),
    );
    let right = (
        end.0 - head_length * (angle + spread).cos(),
        end.1 - head_length * (angle + spread).sin(),
    );

    draw_thick_line(canvas, end, left, color, thickness.max(1));
    draw_thick_line(canvas, end, right, color, thickness.max(1));
}

fn is_dribble_style(drawable: &RenderDrawable) -> bool {
    drawable.drawable_type == "arrow"
        && drawable.style.stroke.0[0] == 244
        && drawable.style.stroke.0[1] == 211
        && drawable.style.stroke.0[2] == 94
}

fn build_regular_polygon_points(
    center_x: f32,
    center_y: f32,
    radius: f32,
    sides: usize,
    start_angle: f32,
) -> Vec<Point<i32>> {
    (0..sides)
        .map(|index| {
            let angle = start_angle + (PI * 2.0 * index as f32) / sides as f32;
            Point::new(
                (center_x + angle.cos() * radius).round() as i32,
                (center_y + angle.sin() * radius).round() as i32,
            )
        })
        .collect()
}

fn build_cone_body_points(center_x: f32, center_y: f32, size: f32, height: f32) -> Vec<Point<i32>> {
    vec![
        Point::new(
            (center_x - size * 0.18).round() as i32,
            (center_y - height * 0.46).round() as i32,
        ),
        Point::new(
            (center_x + size * 0.18).round() as i32,
            (center_y - height * 0.46).round() as i32,
        ),
        Point::new(
            (center_x + size * 0.46).round() as i32,
            (center_y + height * 0.42).round() as i32,
        ),
        Point::new(
            (center_x - size * 0.46).round() as i32,
            (center_y + height * 0.42).round() as i32,
        ),
    ]
}

fn build_cone_band_points(body: &[Point<i32>], start_t: f32, end_t: f32) -> Vec<Point<i32>> {
    vec![
        lerp_i32_point(body[0], body[3], start_t),
        lerp_i32_point(body[1], body[2], start_t),
        lerp_i32_point(body[1], body[2], end_t),
        lerp_i32_point(body[0], body[3], end_t),
    ]
}

fn build_cone_highlight_points(
    center_x: f32,
    center_y: f32,
    size: f32,
    height: f32,
) -> Vec<Point<i32>> {
    vec![
        Point::new(
            (center_x - size * 0.12).round() as i32,
            (center_y - height * 0.22).round() as i32,
        ),
        Point::new(
            (center_x - size * 0.01).round() as i32,
            (center_y - height * 0.10).round() as i32,
        ),
        Point::new(
            (center_x + size * 0.08).round() as i32,
            (center_y + height * 0.12).round() as i32,
        ),
        Point::new(
            (center_x - size * 0.02).round() as i32,
            (center_y + height * 0.26).round() as i32,
        ),
    ]
}

fn draw_polygon_outline(
    canvas: &mut RgbaImage,
    points: &[Point<i32>],
    color: Rgba<u8>,
    thickness: i32,
) {
    if points.len() < 2 {
        return;
    }

    for index in 0..points.len() {
        let start = points[index];
        let end = points[(index + 1) % points.len()];
        draw_thick_line(
            canvas,
            (start.x as f32, start.y as f32),
            (end.x as f32, end.y as f32),
            color,
            thickness.max(1),
        );
    }
}

fn lerp_i32_point(a: Point<i32>, b: Point<i32>, t: f32) -> Point<i32> {
    Point::new(
        (a.x as f32 + (b.x - a.x) as f32 * t).round() as i32,
        (a.y as f32 + (b.y - a.y) as f32 * t).round() as i32,
    )
}

fn line_endpoints(drawable: &RenderDrawable) -> (f32, f32, f32, f32) {
    let x1 = drawable.x;
    let y1 = drawable.y;
    let x2 = drawable.x2.unwrap_or(drawable.x + drawable.width);
    let y2 = drawable.y2.unwrap_or(drawable.y + drawable.height);
    (x1, y1, x2, y2)
}

fn rect_from_points(x1: f32, y1: f32, x2: f32, y2: f32) -> Option<Rect> {
    let left = x1.min(x2).floor() as i32;
    let top = y1.min(y2).floor() as i32;
    let width = (x2 - x1).abs().round() as u32;
    let height = (y2 - y1).abs().round() as u32;
    if width == 0 || height == 0 {
        return None;
    }
    Some(Rect::at(left, top).of_size(width.max(1), height.max(1)))
}

fn measure_text(text: &str, scale: f32) -> (u32, u32) {
    if text.is_empty() {
        return (0, 0);
    }

    text_size(PxScale::from(scale), export_font(), text)
}

fn render_scale_for_canvas(canvas: &RgbaImage) -> f32 {
    (canvas.width() as f32 / LOGICAL_RENDER_WIDTH as f32).max(1.0)
}

fn scaled_length(canvas: &RgbaImage, value: f32) -> f32 {
    value * render_scale_for_canvas(canvas)
}

fn scaled_thickness(canvas: &RgbaImage, value: i32) -> i32 {
    scaled_length(canvas, value as f32).round().max(1.0) as i32
}

fn scaled_radius(canvas: &RgbaImage, value: i32) -> i32 {
    scaled_length(canvas, value as f32).round().max(1.0) as i32
}

fn scaled_padding(canvas: &RgbaImage, value: i32) -> i32 {
    scaled_length(canvas, value as f32).round().max(1.0) as i32
}

fn scaled_font_size(canvas: &RgbaImage, value: f32) -> f32 {
    scaled_length(canvas, value).max(1.0)
}

fn draw_centered_text(
    canvas: &mut RgbaImage,
    text: &str,
    center: (i32, i32),
    color: Rgba<u8>,
    scale: f32,
) {
    let (text_width, text_height) = measure_text(text, scale);
    let x = center.0 - (text_width as i32 / 2);
    let y = center.1 - (text_height as i32 / 2);
    draw_text_bitmap(canvas, text, x, y, color, scale);
}

fn draw_text_bitmap(
    canvas: &mut RgbaImage,
    text: &str,
    x: i32,
    y: i32,
    color: Rgba<u8>,
    scale: f32,
) {
    draw_text_mut(canvas, color, x, y, PxScale::from(scale), export_font(), text);
}

fn export_font() -> &'static FontArc {
    static FONT: OnceLock<FontArc> = OnceLock::new();
    FONT.get_or_init(|| {
        FontArc::try_from_slice(EXPORT_FONT_BYTES)
            .expect("bundled export font should load")
    })
}

fn contrasting_text_color(background: Rgba<u8>) -> Rgba<u8> {
    let luma = 0.2126 * background[0] as f32
        + 0.7152 * background[1] as f32
        + 0.0722 * background[2] as f32;
    if luma > 142.0 {
        Rgba([16, 24, 40, 255])
    } else {
        Rgba([245, 247, 251, 255])
    }
}

fn drawable_priority(drawable: &RenderDrawable) -> u8 {
    match drawable.drawable_type.as_str() {
        "zone" => 0,
        "line" | "arrow" => 1,
        "cone" => 2,
        "player" | "goalkeeper" => 3,
        "ball" => 4,
        "label" => 5,
        _ => 6,
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn blend_optional(a: Option<f32>, b: Option<f32>, t: f32) -> Option<f32> {
    match (a, b) {
        (Some(av), Some(bv)) => Some(lerp(av, bv, t)),
        (Some(av), None) => Some(av),
        (None, Some(bv)) => Some(bv),
        (None, None) => None,
    }
}

fn lerp_color(a: Rgba<u8>, b: Rgba<u8>, t: f32) -> Rgba<u8> {
    let mix = |av: u8, bv: u8| -> u8 {
        (av as f32 + (bv as f32 - av as f32) * t)
            .round()
            .clamp(0.0, 255.0) as u8
    };
    Rgba([
        mix(a[0], b[0]),
        mix(a[1], b[1]),
        mix(a[2], b[2]),
        mix(a[3], b[3]),
    ])
}

fn with_alpha(color: Rgba<u8>, alpha: u8) -> Rgba<u8> {
    Rgba([color[0], color[1], color[2], alpha])
}

fn parse_hex_color(value: Option<&str>, fallback: [u8; 3], opacity: f32) -> Rgba<u8> {
    let [red, green, blue, _] = value
        .and_then(parse_hex_triplet)
        .unwrap_or([fallback[0], fallback[1], fallback[2], 255]);
    let alpha = (opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
    Rgba([red, green, blue, alpha])
}

fn parse_hex_triplet(value: &str) -> Option<[u8; 4]> {
    let trimmed = value.trim().trim_start_matches('#');
    if trimmed.len() != 6 {
        return None;
    }
    let red = u8::from_str_radix(&trimmed[0..2], 16).ok()?;
    let green = u8::from_str_radix(&trimmed[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&trimmed[4..6], 16).ok()?;
    Some([red, green, blue, 255])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{KeyframePayload, ProjectMetaPayload, ScenePayload, TacticalProjectPayload};
    use serde_json::json;
    use std::collections::hash_map::DefaultHasher;
    use std::fs;
    use std::hash::{Hash, Hasher};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn renders_expected_frame_count() {
        let project = fixture_project(Some("full"));
        let out_dir = temp_output_dir("frame_count");
        let result = render_project_sequence(&project, 320, 180, 5, 1200, &out_dir)
            .expect("renderer should generate image sequence");

        let mut frames = fs::read_dir(&result.frames_dir)
            .expect("frames dir should exist")
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("png"))
            .collect::<Vec<_>>();
        frames.sort_by_key(|entry| entry.path());

        assert_eq!(frames.len(), 5);

        let _ = fs::remove_dir_all(&result.frames_dir);
    }

    #[test]
    fn full_and_half_court_outputs_differ() {
        let full_project = fixture_project(Some("full"));
        let half_project = fixture_project(Some("half"));
        let full_dir = temp_output_dir("court_full");
        let half_dir = temp_output_dir("court_half");

        let full_result = render_project_sequence(&full_project, 360, 220, 1, 1, &full_dir)
            .expect("full court render should succeed");
        let half_result = render_project_sequence(&half_project, 360, 220, 1, 1, &half_dir)
            .expect("half court render should succeed");

        let full_hash = hash_file_bytes(full_result.frames_dir.join("frame_000001.png"));
        let half_hash = hash_file_bytes(half_result.frames_dir.join("frame_000001.png"));

        assert_ne!(full_hash, half_hash);

        let _ = fs::remove_dir_all(&full_result.frames_dir);
        let _ = fs::remove_dir_all(&half_result.frames_dir);
    }

    #[test]
    fn interpolated_frame_differs_from_start_frame() {
        let project = fixture_project(Some("full"));
        let out_dir = temp_output_dir("interpolation");
        let result = render_project_sequence(&project, 360, 220, 2, 1000, &out_dir)
            .expect("render should succeed");

        let first = hash_file_bytes(result.frames_dir.join("frame_000001.png"));
        let second = hash_file_bytes(result.frames_dir.join("frame_000002.png"));

        assert_ne!(first, second);

        let _ = fs::remove_dir_all(&result.frames_dir);
    }

    #[test]
    fn render_project_frame_at_clamps_to_timeline_end() {
        let project = fixture_project(Some("full"));
        let end_frame =
            render_project_frame_at(&project, 360, 220, 1000).expect("end-of-timeline frame should render");
        let beyond_frame = render_project_frame_at(&project, 360, 220, 8_000)
            .expect("timestamp past end should clamp and render");

        assert_eq!(hash_image_bytes(&end_frame), hash_image_bytes(&beyond_frame));
    }

    fn hash_file_bytes(path: PathBuf) -> u64 {
        let bytes = fs::read(path).expect("expected frame bytes");
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        hasher.finish()
    }

    fn hash_image_bytes(image: &RgbaImage) -> u64 {
        let mut hasher = DefaultHasher::new();
        image.as_raw().hash(&mut hasher);
        hasher.finish()
    }

    fn temp_output_dir(prefix: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("futsal_renderer_test_{prefix}_{}", now_millis()));
        path
    }

    fn now_millis() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }

    fn fixture_project(court_type: Option<&str>) -> TacticalProjectPayload {
        TacticalProjectPayload {
            meta: ProjectMetaPayload {
                id: "project_test".to_string(),
                name: "Renderer Test".to_string(),
                description: Some("Renderer snapshot fixture".to_string()),
                category: "attacking pattern".to_string(),
                restart_type: "none".to_string(),
                system: Some("3-1".to_string()),
                age_band: Some("senior".to_string()),
                tags: vec!["fixture".to_string()],
                source_template_id: Some("blank-board".to_string()),
                court_type: court_type.map(str::to_string),
                schema_version: 3,
                created_at: "2026-02-19T00:00:00Z".to_string(),
                updated_at: "2026-02-19T00:00:00Z".to_string(),
            },
            scenes: vec![ScenePayload {
                id: "scene_1".to_string(),
                project_id: "project_test".to_string(),
                name: "scene".to_string(),
                order_index: 0,
                duration_ms: 1000,
            }],
            keyframes: vec![
                KeyframePayload {
                    id: "kf_1".to_string(),
                    scene_id: "scene_1".to_string(),
                    timestamp_ms: 0,
                    drawable_state: json!({
                        "p1": {
                            "id": "p1",
                            "type": "player",
                            "x": 72,
                            "y": 112,
                            "rotation": 0,
                            "label": "4",
                            "style": {
                                "stroke": "#111827",
                                "fill": "#2d6a4f",
                                "strokeWidth": 2,
                                "opacity": 1.0
                            }
                        },
                        "a1": {
                            "id": "a1",
                            "type": "arrow",
                            "x": 84,
                            "y": 112,
                            "width": 120,
                            "height": -20,
                            "style": {
                                "stroke": "#38bdf8",
                                "fill": "#38bdf8",
                                "strokeWidth": 3,
                                "opacity": 0.9,
                                "dashed": true
                            }
                        }
                    }),
                },
                KeyframePayload {
                    id: "kf_2".to_string(),
                    scene_id: "scene_1".to_string(),
                    timestamp_ms: 1000,
                    drawable_state: json!({
                        "p1": {
                            "id": "p1",
                            "type": "player",
                            "x": 224,
                            "y": 132,
                            "rotation": 24,
                            "label": "4",
                            "style": {
                                "stroke": "#111827",
                                "fill": "#2d6a4f",
                                "strokeWidth": 2,
                                "opacity": 1.0
                            }
                        },
                        "a1": {
                            "id": "a1",
                            "type": "arrow",
                            "x": 210,
                            "y": 130,
                            "width": 80,
                            "height": 50,
                            "style": {
                                "stroke": "#38bdf8",
                                "fill": "#38bdf8",
                                "strokeWidth": 3,
                                "opacity": 0.9,
                                "dashed": true
                            }
                        }
                    }),
                },
            ],
        }
    }
}
