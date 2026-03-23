import { createId } from "./projectSchema";
import { buildTeamStyle } from "./teamPresets";
import type { Drawable, DrawableType, UUID } from "../types/domain";
import type { ActiveTool } from "../types/ui";

export interface Point {
  x: number;
  y: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

const LABEL_HEIGHT = 22;
const LABEL_MIN_WIDTH = 48;
const LABEL_CHAR_WIDTH = 8;
const LABEL_HORIZONTAL_PADDING = 12;
const CIRCLE_HIT_PADDING = 4;
const LINE_HIT_DISTANCE = 10;
const PLAYER_DIAMETER = 24;
const BALL_DIAMETER = 12;
const CONE_DIAMETER = 14;

export const MIN_DRAW_DISTANCE = 6;
export const MOVE_THRESHOLD = 3;
export type DrawTool = "run" | "pass" | "dribble" | "zone" | "arrow" | "line";

export function estimateLabelSize(label?: string): { width: number; height: number } {
  const text = label?.trim() || "Label";
  return {
    width: Math.max(text.length * LABEL_CHAR_WIDTH + LABEL_HORIZONTAL_PADDING, LABEL_MIN_WIDTH),
    height: LABEL_HEIGHT
  };
}

export function toggleSelection(selectedIds: UUID[], id: UUID): UUID[] {
  return selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id];
}

export function resolveMovableSelection(drawables: Drawable[], selectedIds: UUID[]): UUID[] {
  const selectedIdSet = new Set(selectedIds);
  return drawables.filter((drawable) => selectedIdSet.has(drawable.id) && !drawable.locked).map((drawable) => drawable.id);
}

export function createPlacementDrawable(tool: ActiveTool, point: Point): Drawable | null {
  if (
    tool === "select" ||
    tool === "run" ||
    tool === "pass" ||
    tool === "dribble" ||
    tool === "arrow" ||
    tool === "line" ||
    tool === "zone"
  ) {
    return null;
  }

  if (tool === "label") {
    const size = estimateLabelSize("Note");
    return baseDrawable("label", {
      x: point.x - size.width * 0.5,
      y: point.y - size.height * 0.5
    });
  }

  return baseDrawable(tool, point);
}

export function buildPreviewDrawable(tool: DrawTool, start: Point, end: Point): Drawable {
  return buildCommittedDrawable(tool, start, end, "preview");
}

export function buildCommittedDrawable(
  tool: DrawTool,
  start: Point,
  end: Point,
  idPrefix: string = tool
): Drawable {
  const normalizedTool = normalizeDrawTool(tool);
  const drawableType: DrawableType = normalizedTool === "zone" ? "zone" : "arrow";
  const base = baseDrawable(drawableType, start, createId(idPrefix));
  const style = getConnectionStyle(normalizedTool);
  return {
    ...base,
    style,
    x2: end.x,
    y2: end.y,
    width: end.x - start.x,
    height: end.y - start.y
  };
}

export function offsetDrawable(drawable: Drawable, delta: Point): Drawable {
  return {
    ...drawable,
    x: drawable.x + delta.x,
    y: drawable.y + delta.y,
    x2: drawable.x2 !== undefined ? drawable.x2 + delta.x : drawable.x2,
    y2: drawable.y2 !== undefined ? drawable.y2 + delta.y : drawable.y2
  };
}

export function moveDrawableChanges(drawable: Drawable, delta: Point): Partial<Drawable> {
  return {
    x: drawable.x + delta.x,
    y: drawable.y + delta.y,
    x2: drawable.x2 !== undefined ? drawable.x2 + delta.x : drawable.x2,
    y2: drawable.y2 !== undefined ? drawable.y2 + delta.y : drawable.y2
  };
}

export function constrainDragDelta(
  drawables: Drawable[],
  selectedIds: UUID[],
  requestedDelta: Point,
  canvasSize: CanvasSize
): Point {
  const selectedIdSet = new Set(selectedIds);
  const movable = drawables.filter((drawable) => selectedIdSet.has(drawable.id) && !drawable.locked);
  if (movable.length === 0) {
    return { x: 0, y: 0 };
  }

  const bounds = movable.reduce<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>(
    (current, drawable) => {
      const next = getDrawableBounds(drawable, 0);
      return {
        left: Math.min(current.left, next.left),
        top: Math.min(current.top, next.top),
        right: Math.max(current.right, next.left + next.width),
        bottom: Math.max(current.bottom, next.top + next.height)
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  );

  const minDeltaX = -bounds.left;
  const maxDeltaX = canvasSize.width - bounds.right;
  const minDeltaY = -bounds.top;
  const maxDeltaY = canvasSize.height - bounds.bottom;

  return {
    x: clampDelta(requestedDelta.x, minDeltaX, maxDeltaX),
    y: clampDelta(requestedDelta.y, minDeltaY, maxDeltaY)
  };
}

export function getDrawableBounds(drawable: Drawable, padding: number = 0): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  switch (drawable.type) {
    case "player":
    case "goalkeeper":
    case "ball":
    case "cone": {
      const radius = getCircularDrawableRadius(drawable);
      return {
        left: drawable.x - radius - padding,
        top: drawable.y - radius - padding,
        width: radius * 2 + padding * 2,
        height: radius * 2 + padding * 2
      };
    }
    case "label": {
      const size = estimateLabelSize(drawable.label);
      return {
        left: drawable.x - padding,
        top: drawable.y - padding,
        width: size.width + padding * 2,
        height: size.height + padding * 2
      };
    }
    case "zone": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return {
        left: Math.min(drawable.x, endX) - padding,
        top: Math.min(drawable.y, endY) - padding,
        width: Math.abs(endX - drawable.x) + padding * 2,
        height: Math.abs(endY - drawable.y) + padding * 2
      };
    }
    case "arrow":
    case "line": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return {
        left: Math.min(drawable.x, endX) - padding,
        top: Math.min(drawable.y, endY) - padding,
        width: Math.abs(endX - drawable.x) + padding * 2,
        height: Math.abs(endY - drawable.y) + padding * 2
      };
    }
    default:
      return {
        left: drawable.x - 12 - padding,
        top: drawable.y - 12 - padding,
        width: 24 + padding * 2,
        height: 24 + padding * 2
      };
  }
}

export function collectDrawablesInRect(drawables: Drawable[], start: Point, end: Point): UUID[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  return drawables
    .filter((drawable) => {
      const bounds = getDrawableBounds(drawable);
      return (
        bounds.left >= left &&
        bounds.top >= top &&
        bounds.left + bounds.width <= right &&
        bounds.top + bounds.height <= bottom
      );
    })
    .map((drawable) => drawable.id);
}

export function hitTestDrawables(drawables: Drawable[], point: Point): Drawable | null {
  const ordered = [...drawables].reverse();
  for (const drawable of ordered) {
    if (isPointInsideDrawable(drawable, point)) {
      return drawable;
    }
  }
  return null;
}

function isPointInsideDrawable(drawable: Drawable, point: Point): boolean {
  switch (drawable.type) {
    case "player":
    case "goalkeeper":
    case "ball":
    case "cone": {
      const radius = getCircularDrawableRadius(drawable);
      return Math.hypot(point.x - drawable.x, point.y - drawable.y) <= radius + CIRCLE_HIT_PADDING;
    }
    case "label":
    case "zone": {
      const bounds = getDrawableBounds(drawable);
      return (
        point.x >= bounds.left &&
        point.x <= bounds.left + bounds.width &&
        point.y >= bounds.top &&
        point.y <= bounds.top + bounds.height
      );
    }
    case "arrow":
    case "line": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return distanceToSegment(point, { x: drawable.x, y: drawable.y }, { x: endX, y: endY }) <= LINE_HIT_DISTANCE;
    }
    default:
      return false;
  }
}

export function normalizeDrawPoint(start: Point, point: Point, axisLock: boolean): Point {
  if (!axisLock) {
    return point;
  }

  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: point.x, y: start.y };
  }
  return { x: start.x, y: point.y };
}

function baseDrawable(type: DrawableType, point: Point, explicitId?: string): Drawable {
  const id = explicitId ?? createId(type);

  switch (type) {
    case "goalkeeper":
      return {
        id,
        type,
        teamId: "home",
        x: point.x,
        y: point.y,
        rotation: 0,
        width: PLAYER_DIAMETER,
        height: PLAYER_DIAMETER,
        label: "GK",
        style: buildTeamStyle("home")
      };
    case "ball":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: BALL_DIAMETER,
        height: BALL_DIAMETER,
        style: {
          stroke: "#0f172a",
          fill: "#f8fafc",
          strokeWidth: 2,
          opacity: 1
        }
      };
    case "cone":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: CONE_DIAMETER,
        height: CONE_DIAMETER,
        style: {
          stroke: "#7a3f09",
          fill: "#ff9a1f",
          strokeWidth: 2,
          opacity: 1
        }
      };
    case "arrow":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 100,
        height: 0,
        style: {
          stroke: "#6ee7ff",
          fill: "#6ee7ff",
          strokeWidth: 3,
          opacity: 0.95,
          dashed: true
        }
      };
    case "line":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 100,
        height: 0,
        style: {
          stroke: "#f8fafc",
          fill: "#f8fafc",
          strokeWidth: 3,
          opacity: 0.95
        }
      };
    case "zone":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 120,
        height: 70,
        label: "Zone",
        style: {
          stroke: "#f59e0b",
          fill: "#fbbf24",
          strokeWidth: 2,
          opacity: 0.2
        }
      };
    case "label": {
      const size = estimateLabelSize("Note");
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: size.width,
        height: size.height,
        label: "Note",
        style: {
          stroke: "#d7f6ff",
          fill: "#14b8a6",
          strokeWidth: 2,
          opacity: 0.95
        }
      };
    }
    case "player":
    default:
      return {
        id,
        type: type === "player" ? "player" : "player",
        teamId: "home",
        x: point.x,
        y: point.y,
        rotation: 0,
        width: PLAYER_DIAMETER,
        height: PLAYER_DIAMETER,
        label: "P",
        style: buildTeamStyle("home")
      };
  }
}

function normalizeDrawTool(tool: DrawTool): "run" | "pass" | "dribble" | "zone" {
  switch (tool) {
    case "arrow":
      return "run";
    case "line":
      return "pass";
    default:
      return tool;
  }
}

function getConnectionStyle(tool: "run" | "pass" | "dribble" | "zone"): Drawable["style"] {
  switch (tool) {
    case "pass":
      return {
        stroke: "#f8fafc",
        fill: "#f8fafc",
        strokeWidth: 3,
        opacity: 0.95
      };
    case "dribble":
      return {
        stroke: "#f4d35e",
        fill: "#f4d35e",
        strokeWidth: 4,
        opacity: 0.95
      };
    case "zone":
      return {
        stroke: "#f59e0b",
        fill: "#fbbf24",
        strokeWidth: 2,
        opacity: 0.2
      };
    case "run":
    default:
      return {
        stroke: "#6ee7ff",
        fill: "#6ee7ff",
        strokeWidth: 3,
        opacity: 0.95,
        dashed: true
      };
  }
}

function getCircularDrawableRadius(drawable: Drawable): number {
  switch (drawable.type) {
    case "player":
    case "goalkeeper":
      return Math.max(Math.min(Math.max(drawable.width ?? PLAYER_DIAMETER, drawable.height ?? PLAYER_DIAMETER), PLAYER_DIAMETER) * 0.5, 9);
    case "ball":
      return Math.max(Math.min(Math.max(drawable.width ?? BALL_DIAMETER, drawable.height ?? BALL_DIAMETER), BALL_DIAMETER) * 0.5, 4);
    case "cone":
      return Math.max(Math.max(drawable.width ?? CONE_DIAMETER, drawable.height ?? CONE_DIAMETER) * 0.5, 5);
    default:
      return 12;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampDelta(delta: number, min: number, max: number): number {
  if (min > max) {
    return 0;
  }
  return clamp(delta, min, max);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const projectionX = start.x + t * dx;
  const projectionY = start.y + t * dy;
  return Math.hypot(point.x - projectionX, point.y - projectionY);
}
