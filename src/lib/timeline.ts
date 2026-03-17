import type { Drawable, DrawableType, Keyframe, TacticalProject } from "../types/domain";

export interface SampledTimelineState {
  activeSceneId: string;
  activeSceneName: string;
  localTimestampMs: number;
  drawables: Drawable[];
}

export interface ScenePlaybackWindow {
  sceneId: string;
  sceneName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export function timelineSanityIssues(project: TacticalProject): string[] {
  const issues: string[] = [];

  if (project.scenes.length === 0) {
    issues.push("project has no scenes");
    return issues;
  }

  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  for (const keyframe of project.keyframes) {
    if (!sceneIds.has(keyframe.sceneId)) {
      issues.push(`keyframe ${keyframe.id} references unknown scene ${keyframe.sceneId}`);
    }
    if (keyframe.timestampMs < 0) {
      issues.push(`keyframe ${keyframe.id} has negative timestamp`);
    }
  }

  for (const scene of project.scenes) {
    if (scene.durationMs <= 0) {
      issues.push(`scene ${scene.id} has non-positive duration`);
    }
    const sceneKeyframes = project.keyframes
      .filter((keyframe) => keyframe.sceneId === scene.id)
      .sort((left, right) => left.timestampMs - right.timestampMs);
    if (sceneKeyframes.length === 0) {
      issues.push(`scene ${scene.id} has no keyframes`);
    }
    for (let index = 1; index < sceneKeyframes.length; index += 1) {
      if (sceneKeyframes[index].timestampMs < sceneKeyframes[index - 1].timestampMs) {
        issues.push(`scene ${scene.id} keyframes are not sorted by timestamp`);
        break;
      }
    }
  }

  return issues;
}

interface SceneWindow extends ScenePlaybackWindow {
  sceneId: string;
  sceneName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  keyframes: Keyframe[];
}

const drawablePriority: Record<DrawableType, number> = {
  zone: 0,
  line: 1,
  arrow: 1,
  cone: 2,
  player: 3,
  goalkeeper: 3,
  ball: 4,
  label: 5
};

export function sampleTimelineAt(project: TacticalProject, playbackMs: number): SampledTimelineState {
  const windows = buildSceneWindows(project);
  if (windows.length === 0) {
    return {
      activeSceneId: "",
      activeSceneName: "",
      localTimestampMs: 0,
      drawables: []
    };
  }

  const boundedPlaybackMs = Math.max(0, playbackMs);
  const activeWindow =
    windows.find((window) => boundedPlaybackMs < window.endMs) ?? windows[windows.length - 1];
  const localTimestampMs = Math.min(
    Math.max(0, boundedPlaybackMs - activeWindow.startMs),
    activeWindow.durationMs
  );
  const drawables = sampleSceneDrawables(activeWindow.keyframes, localTimestampMs);

  return {
    activeSceneId: activeWindow.sceneId,
    activeSceneName: activeWindow.sceneName,
    localTimestampMs,
    drawables
  };
}

export function listScenePlaybackWindows(project: TacticalProject): ScenePlaybackWindow[] {
  return buildSceneWindows(project).map(({ keyframes: _keyframes, ...window }) => window);
}

function buildSceneWindows(project: TacticalProject): SceneWindow[] {
  let cursor = 0;
  return [...project.scenes]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((scene) => {
      const keyframes = project.keyframes
        .filter((keyframe) => keyframe.sceneId === scene.id)
        .sort((a, b) => a.timestampMs - b.timestampMs);
      const startMs = cursor;
      const endMs = startMs + scene.durationMs;
      cursor = endMs;
      return {
        sceneId: scene.id,
        sceneName: scene.name,
        startMs,
        endMs,
        durationMs: scene.durationMs,
        keyframes
      };
    })
    .filter((window) => window.keyframes.length > 0);
}

function sampleSceneDrawables(keyframes: Keyframe[], timestampMs: number): Drawable[] {
  if (keyframes.length === 0) {
    return [];
  }

  if (keyframes.length === 1) {
    return normalizedDrawableState(keyframes[0].drawableState);
  }

  let lower = keyframes[0];
  let upper = keyframes[keyframes.length - 1];

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];

    if (timestampMs <= current.timestampMs) {
      lower = current;
      upper = current;
      break;
    }

    if (timestampMs >= current.timestampMs && timestampMs <= next.timestampMs) {
      lower = current;
      upper = next;
      break;
    }
  }

  const lowerState = lower.drawableState;
  const upperState = upper.drawableState;

  const ids = new Set<string>([...Object.keys(lowerState), ...Object.keys(upperState)]);
  const lowerTime = lower.timestampMs;
  const upperTime = upper.timestampMs;
  const t =
    lowerTime === upperTime
      ? 0
      : clamp((timestampMs - lowerTime) / (upperTime - lowerTime), 0, 1);

  const interpolated = [...ids]
    .map((id) => interpolateDrawable(lowerState[id], upperState[id], t))
    .filter((drawable): drawable is Drawable => Boolean(drawable));

  return sortDrawables(interpolated);
}

function interpolateDrawable(a: Drawable | undefined, b: Drawable | undefined, t: number): Drawable | null {
  if (!a && !b) {
    return null;
  }

  if (a && !b) {
    return normalizeDrawable(a);
  }

  if (!a && b) {
    return normalizeDrawable(b);
  }

  const sourceA = normalizeDrawable(a as Drawable);
  const sourceB = normalizeDrawable(b as Drawable);

  return {
    ...sourceA,
    type: sourceA.type,
    x: lerp(sourceA.x, sourceB.x, t),
    y: lerp(sourceA.y, sourceB.y, t),
    x2: blendOptional(sourceA.x2, sourceB.x2, t),
    y2: blendOptional(sourceA.y2, sourceB.y2, t),
    rotation: lerp(sourceA.rotation, sourceB.rotation, t),
    width: lerp(sourceA.width ?? 0, sourceB.width ?? 0, t),
    height: lerp(sourceA.height ?? 0, sourceB.height ?? 0, t),
    label: sourceA.label ?? sourceB.label,
    style: {
      stroke: mixHexColors(sourceA.style.stroke, sourceB.style.stroke, t),
      fill: mixHexColors(sourceA.style.fill, sourceB.style.fill, t),
      strokeWidth: lerp(sourceA.style.strokeWidth, sourceB.style.strokeWidth, t),
      opacity: lerp(sourceA.style.opacity, sourceB.style.opacity, t),
      dashed: t < 0.5 ? sourceA.style.dashed : sourceB.style.dashed
    }
  };
}

function normalizedDrawableState(drawableState: Record<string, Drawable>): Drawable[] {
  return sortDrawables(Object.values(drawableState).map((drawable) => normalizeDrawable(drawable)));
}

function sortDrawables(drawables: Drawable[]): Drawable[] {
  return [...drawables]
    .filter((drawable) => !drawable.hidden)
    .sort((left, right) => {
      const zIndexDelta = (left.zIndex ?? drawablePriority[left.type]) - (right.zIndex ?? drawablePriority[right.type]);
      if (zIndexDelta !== 0) {
        return zIndexDelta;
      }
      return drawablePriority[left.type] - drawablePriority[right.type];
    });
}

function normalizeDrawable(drawable: Drawable): Drawable {
  const defaults = defaultStyleForType(drawable.type);

  return {
    ...drawable,
    rotation: drawable.rotation ?? 0,
    width: drawable.width ?? defaults.width,
    height: drawable.height ?? defaults.height,
    style: {
      stroke: drawable.style.stroke ?? defaults.stroke,
      fill: drawable.style.fill ?? defaults.fill,
      strokeWidth: drawable.style.strokeWidth ?? defaults.strokeWidth,
      opacity: drawable.style.opacity ?? defaults.opacity,
      dashed: drawable.style.dashed ?? false
    }
  };
}

function defaultStyleForType(type: DrawableType): {
  width: number;
  height: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
} {
  switch (type) {
    case "player":
      return {
        width: 28,
        height: 28,
        stroke: "#111827",
        fill: "#2d6a4f",
        strokeWidth: 2,
        opacity: 1
      };
    case "goalkeeper":
      return {
        width: 28,
        height: 28,
        stroke: "#111827",
        fill: "#ef476f",
        strokeWidth: 2,
        opacity: 1
      };
    case "ball":
      return {
        width: 12,
        height: 12,
        stroke: "#111827",
        fill: "#f4d35e",
        strokeWidth: 1,
        opacity: 1
      };
    case "cone":
      return {
        width: 10,
        height: 10,
        stroke: "#92400e",
        fill: "#ff9f1c",
        strokeWidth: 2,
        opacity: 1
      };
    case "zone":
      return {
        width: 120,
        height: 70,
        stroke: "#b45309",
        fill: "#f59e0b",
        strokeWidth: 2,
        opacity: 0.2
      };
    case "arrow":
    case "line":
      return {
        width: 100,
        height: 0,
        stroke: "#38bdf8",
        fill: "#38bdf8",
        strokeWidth: 3,
        opacity: 0.95
      };
    case "label":
      return {
        width: 0,
        height: 0,
        stroke: "#115e59",
        fill: "#14b8a6",
        strokeWidth: 2,
        opacity: 0.9
      };
    default:
      return {
        width: 0,
        height: 0,
        stroke: "#111827",
        fill: "#2d6a4f",
        strokeWidth: 2,
        opacity: 1
      };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendOptional(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (typeof a === "number" && typeof b === "number") {
    return lerp(a, b, t);
  }
  return typeof a === "number" ? a : b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixHexColors(a: string, b: string, t: number): string {
  const parsedA = parseHexColor(a);
  const parsedB = parseHexColor(b);

  if (!parsedA || !parsedB) {
    return t < 0.5 ? a : b;
  }

  const red = Math.round(lerp(parsedA[0], parsedB[0], t));
  const green = Math.round(lerp(parsedA[1], parsedB[1], t));
  const blue = Math.round(lerp(parsedA[2], parsedB[2], t));

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim().replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return null;
  }

  return [red, green, blue];
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
