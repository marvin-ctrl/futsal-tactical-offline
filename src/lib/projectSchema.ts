import type { Drawable, Keyframe, TacticalProject, UUID } from "../types/domain";
import {
  DEFAULT_PLAY_CATEGORY,
  DEFAULT_RESTART_TYPE,
  isAgeBand,
  isPlayCategory,
  isRestartType,
  isSystemType,
  sanitizeTags
} from "./playMetadata";
import { sampleTimelineAt } from "./timeline";

export const CURRENT_SCHEMA_VERSION = 3;

function normalizeCourtType(courtType: TacticalProject["meta"]["courtType"] | "half" | undefined) {
  switch (courtType) {
    case "half":
    case "half-attacking":
      return "half-attacking";
    case "half-defending":
      return "half-defending";
    case "full":
    default:
      return "full";
  }
}

export function migrateProjectToCurrent(project: TacticalProject): TacticalProject {
  const schemaVersion = project.meta.schemaVersion ?? 1;
  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return normalizeProject(project, CURRENT_SCHEMA_VERSION);
  }

  const migrated = normalizeProject(project, CURRENT_SCHEMA_VERSION);
  return {
    ...migrated,
    meta: {
      ...migrated.meta,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    }
  };
}

export function normalizeProject(project: TacticalProject, schemaVersion = CURRENT_SCHEMA_VERSION): TacticalProject {
  return {
    ...project,
    meta: {
      ...project.meta,
      description: project.meta.description?.trim() ?? "",
      category: isPlayCategory(project.meta.category) ? project.meta.category : DEFAULT_PLAY_CATEGORY,
      restartType: isRestartType(project.meta.restartType) ? project.meta.restartType : DEFAULT_RESTART_TYPE,
      system: isSystemType(project.meta.system) ? project.meta.system : undefined,
      ageBand: isAgeBand(project.meta.ageBand) ? project.meta.ageBand : undefined,
      tags: sanitizeTags(project.meta.tags),
      sourceTemplateId: project.meta.sourceTemplateId ?? null,
      courtType: normalizeCourtType(project.meta.courtType as TacticalProject["meta"]["courtType"] | "half" | undefined),
      schemaVersion,
      createdAt: project.meta.createdAt,
      updatedAt: project.meta.updatedAt
    },
    keyframes: project.keyframes.map((keyframe) => ({
      ...keyframe,
      drawableState: cloneDrawableState(keyframe.drawableState)
    }))
  };
}

export function cloneDrawableState(drawableState: Record<UUID, Drawable>): Record<UUID, Drawable> {
  return Object.fromEntries(
    Object.entries(drawableState).map(([id, drawable]) => [
      id,
      {
        ...drawable,
        style: { ...drawable.style }
      }
    ])
  );
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ScenePlaybackContext {
  sceneId: string;
  sceneName: string;
  localTimestampMs: number;
}

function resolveScenePlaybackContext(
  project: TacticalProject,
  playbackMs: number
): ScenePlaybackContext | null {
  const sampled = sampleTimelineAt(project, playbackMs);
  if (!sampled.activeSceneId) {
    return null;
  }

  return {
    sceneId: sampled.activeSceneId,
    sceneName: sampled.activeSceneName,
    localTimestampMs: Math.round(sampled.localTimestampMs)
  };
}

interface EditableKeyframeResolution {
  keyframeId: string;
  project: TacticalProject;
  createdKeyframe: Keyframe | null;
}

export function ensureEditableKeyframe(
  project: TacticalProject,
  playbackMs: number
): EditableKeyframeResolution | null {
  const sceneContext = resolveScenePlaybackContext(project, playbackMs);
  if (!sceneContext) {
    return null;
  }

  const existing = project.keyframes.find(
    (keyframe) =>
      keyframe.sceneId === sceneContext.sceneId &&
      Math.round(keyframe.timestampMs) === sceneContext.localTimestampMs
  );

  if (existing) {
    return {
      keyframeId: existing.id,
      project,
      createdKeyframe: null
    };
  }

  const sampled = sampleTimelineAt(project, playbackMs);
  const drawableState = Object.fromEntries(
    sampled.drawables.map((drawable) => [
      drawable.id,
      {
        ...drawable,
        style: { ...drawable.style }
      }
    ])
  );

  const createdKeyframe: Keyframe = {
    id: createId("kf"),
    sceneId: sceneContext.sceneId,
    timestampMs: sceneContext.localTimestampMs,
    drawableState
  };

  const nextProject: TacticalProject = {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString()
    },
    keyframes: [...project.keyframes, createdKeyframe].sort((left, right) => {
      if (left.sceneId !== right.sceneId) {
        const leftScene = project.scenes.find((scene) => scene.id === left.sceneId)?.orderIndex ?? 0;
        const rightScene = project.scenes.find((scene) => scene.id === right.sceneId)?.orderIndex ?? 0;
        return leftScene - rightScene;
      }
      return left.timestampMs - right.timestampMs;
    })
  };

  return {
    keyframeId: createdKeyframe.id,
    project: nextProject,
    createdKeyframe
  };
}

export function replaceKeyframeDrawableState(
  project: TacticalProject,
  keyframeId: string,
  drawableState: Record<UUID, Drawable>
): TacticalProject {
  return {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString()
    },
    keyframes: project.keyframes.map((keyframe) =>
      keyframe.id === keyframeId
        ? {
            ...keyframe,
            drawableState: cloneDrawableState(drawableState)
          }
        : keyframe
    )
  };
}
