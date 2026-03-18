use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaPayload {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub restart_type: String,
    pub system: Option<String>,
    pub age_band: Option<String>,
    pub tags: Vec<String>,
    pub source_template_id: Option<String>,
    pub court_type: Option<String>,
    pub schema_version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePayload {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub order_index: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframePayload {
    pub id: String,
    pub scene_id: String,
    pub timestamp_ms: i64,
    pub drawable_state: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticalProjectPayload {
    pub meta: ProjectMetaPayload,
    pub scenes: Vec<ScenePayload>,
    pub keyframes: Vec<KeyframePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub restart_type: String,
    pub system: Option<String>,
    pub age_band: Option<String>,
    pub tags: Vec<String>,
    pub scene_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mp4ExportRequest {
    pub project_id: String,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub duration_ms: u64,
    pub output_file_name: Option<String>,
    pub input_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticExportRequest {
    pub project_id: String,
    pub width: u32,
    pub height: u32,
    pub timestamp_ms: u64,
    pub output_file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequestPayload {
    pub export_type: String,
    pub project_id: String,
    pub fps: Option<u32>,
    pub width: u32,
    pub height: u32,
    pub duration_ms: Option<u64>,
    pub timestamp_ms: Option<u64>,
    pub output_file_name: Option<String>,
    pub input_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobPayload {
    pub id: String,
    pub project_id: String,
    pub export_type: String,
    pub status: String,
    pub fps: Option<i64>,
    pub resolution: Option<String>,
    pub output_path: Option<String>,
    pub error_message: Option<String>,
    pub retry_of_job_id: Option<String>,
    pub cancel_requested_at: Option<String>,
    pub canceled_at: Option<String>,
    pub worker_heartbeat_at: Option<String>,
    pub progress_pct: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaMigrationRow {
    pub id: String,
    pub applied_at: String,
}
