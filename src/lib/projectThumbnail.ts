import { drawTacticalFrame } from "./canvasRenderer";
import { sampleTimelineAt } from "./timeline";
import type { TacticalProject } from "../types/domain";

const PROJECT_THUMBNAIL_STORAGE_PREFIX = "play.thumbnail.v3.";

function projectThumbnailStorageKey(projectId: string): string {
  return `${PROJECT_THUMBNAIL_STORAGE_PREFIX}${projectId}`;
}

export function readProjectThumbnail(projectId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(projectThumbnailStorageKey(projectId));
}

export function cacheProjectThumbnail(project: TacticalProject, width = 560, height = 315): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const sampled = sampleTimelineAt(project, 0);
  drawTacticalFrame(context, {
    width,
    height,
    courtType: project.meta.courtType ?? "full",
    drawables: sampled.drawables
  });

  const dataUrl = canvas.toDataURL("image/png");
  window.localStorage.setItem(projectThumbnailStorageKey(project.meta.id), dataUrl);
  return dataUrl;
}

export function removeProjectThumbnail(projectId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(projectThumbnailStorageKey(projectId));
}
