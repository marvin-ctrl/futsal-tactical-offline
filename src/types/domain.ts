export type UUID = string;

export type PlayCategory =
  | "set piece"
  | "attacking pattern"
  | "defensive pattern"
  | "transition";

export type RestartType = "corner" | "kick-in" | "free kick" | "goalkeeper restart" | "none";

export type SystemType = "3-1" | "4-0" | "1-1-2" | "1-2-1" | "other";

export type AgeBand = "youth" | "academy" | "senior" | "pro";

export type CourtType = "full" | "half-attacking" | "half-defending";

export type TeamId = "home" | "away";

export type ExportType = "png" | "pdf" | "mp4";

export type DrawableType =
  | "player"
  | "goalkeeper"
  | "ball"
  | "cone"
  | "zone"
  | "arrow"
  | "line"
  | "label";

export interface ProjectMeta {
  id: UUID;
  name: string;
  description?: string;
  category: PlayCategory;
  restartType: RestartType;
  system?: SystemType;
  ageBand?: AgeBand;
  tags: string[];
  sourceTemplateId?: string | null;
  courtType?: CourtType;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DrawableStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  dashed?: boolean;
}

export interface Drawable {
  id: UUID;
  type: DrawableType;
  teamId?: TeamId;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  rotation: number;
  width?: number;
  height?: number;
  label?: string;
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
  style: DrawableStyle;
}

export interface Scene {
  id: UUID;
  projectId: UUID;
  name: string;
  orderIndex: number;
  durationMs: number;
}

export interface Keyframe {
  id: UUID;
  sceneId: UUID;
  timestampMs: number;
  drawableState: Record<UUID, Drawable>;
}

export interface TacticalProject {
  meta: ProjectMeta;
  scenes: Scene[];
  keyframes: Keyframe[];
}

export interface ProjectRow {
  id: UUID;
  name: string;
  description?: string;
  category: PlayCategory;
  restartType: RestartType;
  system?: SystemType;
  ageBand?: AgeBand;
  tags: string[];
  sceneCount: number;
  updatedAt: string;
}

export interface ExportJob {
  id: UUID;
  projectId: UUID;
  exportType: ExportType | string;
  status: "queued" | "running" | "canceling" | "canceled" | "succeeded" | "failed";
  fps?: number;
  resolution?: string;
  progressPct: number;
  outputPath?: string;
  errorMessage?: string;
  retryOfJobId?: string;
  cancelRequestedAt?: string;
  canceledAt?: string;
  workerHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mp4ExportRequest {
  projectId: UUID;
  fps: 30 | 60;
  width: number;
  height: number;
  durationMs: number;
  outputFileName?: string;
  inputPattern?: string;
}

export interface StaticExportRequest {
  projectId: UUID;
  width: number;
  height: number;
  timestampMs: number;
  outputFileName?: string;
}
