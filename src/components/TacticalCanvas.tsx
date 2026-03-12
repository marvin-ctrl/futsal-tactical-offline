import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { drawTacticalFrame } from "../lib/canvasRenderer";
import { createId } from "../lib/projectSchema";
import { sampleTimelineAt } from "../lib/timeline";
import type { Drawable, DrawableType, TacticalProject, UUID } from "../types/domain";
import type { ActiveTool, EditorCommand } from "../types/ui";

interface TacticalCanvasProps {
  project: TacticalProject;
  playbackMs: number;
  width?: number;
  height?: number;
  activeTool?: ActiveTool;
  selectedIds?: UUID[];
  interactionCancelToken?: number;
  onSelectIds?: (ids: UUID[]) => void;
  onCommand?: (command: EditorCommand, options?: { label?: string; selectionIds?: UUID[] }) => void;
  onAutoPause?: () => void;
}

interface Point {
  x: number;
  y: number;
}

type InteractionState =
  | { mode: "idle" }
  | { mode: "placing"; tool: ActiveTool; point: Point }
  | { mode: "marquee"; start: Point; current: Point; additive: boolean }
  | { mode: "dragging"; start: Point; current: Point; ids: UUID[] }
  | { mode: "drawing"; tool: "arrow" | "line" | "zone"; start: Point; current: Point };

const MIN_DRAW_DISTANCE = 6;
const MOVE_THRESHOLD = 3;
const DEFAULT_TOOL: ActiveTool = "select";

export function TacticalCanvas({
  project,
  playbackMs,
  width: fixedWidth,
  height: fixedHeight,
  activeTool = DEFAULT_TOOL,
  selectedIds = [],
  interactionCancelToken,
  onSelectIds,
  onCommand,
  onAutoPause
}: TacticalCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({
    width: fixedWidth ?? 960,
    height: fixedHeight ?? 540
  });
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });

  const sampledState = useMemo(() => sampleTimelineAt(project, playbackMs), [project, playbackMs]);

  const renderDrawables = useMemo(() => {
    let drawables = sampledState.drawables;

    if (interaction.mode === "dragging") {
      const deltaX = interaction.current.x - interaction.start.x;
      const deltaY = interaction.current.y - interaction.start.y;
      drawables = drawables.map((drawable) => {
        if (!interaction.ids.includes(drawable.id)) {
          return drawable;
        }
        return offsetDrawable(drawable, deltaX, deltaY);
      });
    }

    if (interaction.mode === "drawing") {
      drawables = [
        ...drawables,
        buildPreviewDrawable(interaction.tool, interaction.start, interaction.current)
      ];
    }

    return drawables;
  }, [interaction, sampledState.drawables]);

  useLayoutEffect(() => {
    if (fixedWidth && fixedHeight) {
      setCanvasSize({ width: fixedWidth, height: fixedHeight });
    }
  }, [fixedHeight, fixedWidth]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || fixedWidth || fixedHeight) {
      return;
    }

    const resize = () => {
      const nextWidth = Math.max(320, Math.floor(wrapper.clientWidth));
      setCanvasSize({
        width: nextWidth,
        height: Math.floor(nextWidth * 0.5625)
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fixedHeight, fixedWidth]);

  useEffect(() => {
    setInteraction({ mode: "idle" });
  }, [interactionCancelToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasSize.width * ratio);
    canvas.height = Math.floor(canvasSize.height * ratio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTacticalFrame(context, {
      width: canvasSize.width,
      height: canvasSize.height,
      courtType: project.meta.courtType ?? "full",
      drawables: renderDrawables
    });
    drawSelectionOverlay(context, renderDrawables, selectedIds);

    if (interaction.mode === "marquee") {
      drawMarqueeOverlay(context, interaction.start, interaction.current);
    }
  }, [canvasSize.height, canvasSize.width, interaction, project.meta.courtType, renderDrawables, selectedIds]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = resolveCanvasPoint(event, canvasRef.current, canvasSize);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === "select") {
      const hit = hitTestDrawables(sampledState.drawables, point);
      if (hit) {
        const nextSelection = event.shiftKey
          ? toggleSelection(selectedIds, hit.id)
          : selectedIds.includes(hit.id)
            ? selectedIds
            : [hit.id];
        onSelectIds?.(nextSelection);
        if (nextSelection.includes(hit.id)) {
          setInteraction({
            mode: "dragging",
            start: point,
            current: point,
            ids: nextSelection
          });
        }
        return;
      }

      setInteraction({
        mode: "marquee",
        start: point,
        current: point,
        additive: event.shiftKey
      });
      return;
    }

    if (activeTool === "arrow" || activeTool === "line" || activeTool === "zone") {
      onAutoPause?.();
      setInteraction({
        mode: "drawing",
        tool: activeTool,
        start: point,
        current: point
      });
      return;
    }

    onAutoPause?.();
    setInteraction({
      mode: "placing",
      tool: activeTool,
      point
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = resolveCanvasPoint(event, canvasRef.current, canvasSize);
    if (!point) {
      return;
    }

    setInteraction((current) => {
      switch (current.mode) {
        case "marquee":
          return { ...current, current: point };
        case "dragging":
          return { ...current, current: point };
        case "drawing":
          return {
            ...current,
            current: normalizeDrawPoint(current.start, point, event.shiftKey)
          };
        default:
          return current;
      }
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = resolveCanvasPoint(event, canvasRef.current, canvasSize);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!point) {
      setInteraction({ mode: "idle" });
      return;
    }

    if (interaction.mode === "placing") {
      commitPlacement(interaction.tool, interaction.point, onCommand, onSelectIds);
      setInteraction({ mode: "idle" });
      return;
    }

    if (interaction.mode === "marquee") {
      const ids = collectDrawablesInRect(sampledState.drawables, interaction.start, point);
      onSelectIds?.(interaction.additive ? [...new Set([...selectedIds, ...ids])] : ids);
      setInteraction({ mode: "idle" });
      return;
    }

    if (interaction.mode === "dragging") {
      const deltaX = point.x - interaction.start.x;
      const deltaY = point.y - interaction.start.y;
      if (Math.hypot(deltaX, deltaY) >= MOVE_THRESHOLD && interaction.ids.length > 0) {
        onCommand?.(
          {
            type: "updateDrawables",
            updates: interaction.ids.map((id) => {
              const drawable = sampledState.drawables.find((candidate) => candidate.id === id);
              return {
                id,
                changes: drawable ? moveDrawableChanges(drawable, deltaX, deltaY, canvasSize) : {}
              };
            })
          },
          {
            label: "move selection"
          }
        );
      }
      setInteraction({ mode: "idle" });
      return;
    }

    if (interaction.mode === "drawing") {
      if (Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y) >= MIN_DRAW_DISTANCE) {
        const drawable = buildCommittedDrawable(interaction.tool, interaction.start, point);
        onCommand?.(
          {
            type: "addDrawables",
            drawables: [drawable]
          },
          {
            label: `add ${interaction.tool}`,
            selectionIds: [drawable.id]
          }
        );
        onSelectIds?.([drawable.id]);
      }
      setInteraction({ mode: "idle" });
      return;
    }

    setInteraction({ mode: "idle" });
  };

  return (
    <div className="tactical-preview-wrap tactical-preview-wrap--stage" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="tactical-preview-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <p className="tactical-preview-meta">
        Scene: {sampledState.activeSceneName || "-"} ({Math.round(sampledState.localTimestampMs)} ms)
      </p>
    </div>
  );
}

function resolveCanvasPoint(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  canvasSize: { width: number; height: number }
): Point | null {
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * canvasSize.width, 0, canvasSize.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * canvasSize.height, 0, canvasSize.height)
  };
}

function toggleSelection(selectedIds: UUID[], id: UUID): UUID[] {
  return selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id];
}

function commitPlacement(
  tool: ActiveTool,
  point: Point,
  onCommand: TacticalCanvasProps["onCommand"],
  onSelectIds: TacticalCanvasProps["onSelectIds"]
) {
  if (tool === "select" || tool === "arrow" || tool === "line" || tool === "zone") {
    return;
  }

  const drawable = baseDrawable(tool, point);
  onCommand?.(
    {
      type: "addDrawables",
      drawables: [drawable]
    },
    {
      label: `add ${tool}`,
      selectionIds: [drawable.id]
    }
  );
  onSelectIds?.([drawable.id]);
}

function buildPreviewDrawable(tool: "arrow" | "line" | "zone", start: Point, end: Point): Drawable {
  return buildCommittedDrawable(tool, start, end, "preview");
}

function buildCommittedDrawable(
  tool: "arrow" | "line" | "zone",
  start: Point,
  end: Point,
  idPrefix: string = tool
): Drawable {
  const base = baseDrawable(tool, start, createId(idPrefix));
  return {
    ...base,
    x2: end.x,
    y2: end.y,
    width: end.x - start.x,
    height: end.y - start.y
  };
}

function baseDrawable(type: DrawableType, point: Point, explicitId?: string): Drawable {
  const id = explicitId ?? createId(type);
  switch (type) {
    case "goalkeeper":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 28,
        height: 28,
        label: "GK",
        style: {
          stroke: "#08131f",
          fill: "#ff6b6b",
          strokeWidth: 2,
          opacity: 1
        }
      };
    case "ball":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 12,
        height: 12,
        style: {
          stroke: "#0f172a",
          fill: "#ffe082",
          strokeWidth: 1,
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
        width: 12,
        height: 12,
        style: {
          stroke: "#8a4b08",
          fill: "#ff9f1c",
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
    case "label":
      return {
        id,
        type,
        x: point.x,
        y: point.y,
        rotation: 0,
        label: "Note",
        style: {
          stroke: "#d7f6ff",
          fill: "#14b8a6",
          strokeWidth: 2,
          opacity: 0.95
        }
      };
    case "player":
    default:
      return {
        id,
        type: type === "player" ? "player" : "player",
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 28,
        height: 28,
        label: "P",
        style: {
          stroke: "#08131f",
          fill: "#0f2b63",
          strokeWidth: 2,
          opacity: 1
        }
      };
  }
}

function offsetDrawable(drawable: Drawable, deltaX: number, deltaY: number): Drawable {
  return {
    ...drawable,
    x: drawable.x + deltaX,
    y: drawable.y + deltaY,
    x2: drawable.x2 !== undefined ? drawable.x2 + deltaX : drawable.x2,
    y2: drawable.y2 !== undefined ? drawable.y2 + deltaY : drawable.y2
  };
}

function moveDrawableChanges(
  drawable: Drawable,
  deltaX: number,
  deltaY: number,
  canvasSize: { width: number; height: number }
): Partial<Drawable> {
  const nextX = clamp(drawable.x + deltaX, 0, canvasSize.width);
  const nextY = clamp(drawable.y + deltaY, 0, canvasSize.height);
  const change: Partial<Drawable> = {
    x: nextX,
    y: nextY
  };

  if (drawable.x2 !== undefined) {
    change.x2 = clamp(drawable.x2 + deltaX, 0, canvasSize.width);
  }
  if (drawable.y2 !== undefined) {
    change.y2 = clamp(drawable.y2 + deltaY, 0, canvasSize.height);
  }
  return change;
}

function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  drawables: Drawable[],
  selectedIds: UUID[]
) {
  if (selectedIds.length === 0) {
    return;
  }

  context.save();
  context.strokeStyle = "rgba(132, 228, 255, 0.95)";
  context.fillStyle = "rgba(132, 228, 255, 0.12)";
  context.lineWidth = 2;
  context.setLineDash([10, 6]);

  for (const drawable of drawables) {
    if (!selectedIds.includes(drawable.id)) {
      continue;
    }
    const bounds = getDrawableBounds(drawable);
    context.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
    context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
  }

  context.restore();
}

function drawMarqueeOverlay(context: CanvasRenderingContext2D, start: Point, end: Point) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  context.save();
  context.fillStyle = "rgba(132, 228, 255, 0.14)";
  context.strokeStyle = "rgba(132, 228, 255, 0.95)";
  context.setLineDash([8, 6]);
  context.fillRect(left, top, width, height);
  context.strokeRect(left, top, width, height);
  context.restore();
}

function collectDrawablesInRect(drawables: Drawable[], start: Point, end: Point): UUID[] {
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

function hitTestDrawables(drawables: Drawable[], point: Point): Drawable | null {
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
      const radius = Math.max(drawable.width ?? 24, drawable.height ?? 24) * 0.5;
      return Math.hypot(point.x - drawable.x, point.y - drawable.y) <= radius + 4;
    }
    case "label": {
      const bounds = getDrawableBounds(drawable);
      return point.x >= bounds.left && point.x <= bounds.left + bounds.width && point.y >= bounds.top && point.y <= bounds.top + bounds.height;
    }
    case "zone": {
      const bounds = getDrawableBounds(drawable);
      return point.x >= bounds.left && point.x <= bounds.left + bounds.width && point.y >= bounds.top && point.y <= bounds.top + bounds.height;
    }
    case "arrow":
    case "line": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return distanceToSegment(point, { x: drawable.x, y: drawable.y }, { x: endX, y: endY }) <= 10;
    }
    default:
      return false;
  }
}

function getDrawableBounds(drawable: Drawable) {
  switch (drawable.type) {
    case "player":
    case "goalkeeper":
    case "ball":
    case "cone": {
      const radius = Math.max(drawable.width ?? 24, drawable.height ?? 24) * 0.5;
      return {
        left: drawable.x - radius - 6,
        top: drawable.y - radius - 6,
        width: radius * 2 + 12,
        height: radius * 2 + 12
      };
    }
    case "label":
      return {
        left: drawable.x - 8,
        top: drawable.y - 20,
        width: Math.max((drawable.label?.length ?? 4) * 8, 48),
        height: 28
      };
    case "zone": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return {
        left: Math.min(drawable.x, endX),
        top: Math.min(drawable.y, endY),
        width: Math.abs(endX - drawable.x),
        height: Math.abs(endY - drawable.y)
      };
    }
    case "arrow":
    case "line": {
      const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
      const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
      return {
        left: Math.min(drawable.x, endX) - 8,
        top: Math.min(drawable.y, endY) - 8,
        width: Math.abs(endX - drawable.x) + 16,
        height: Math.abs(endY - drawable.y) + 16
      };
    }
    default:
      return {
        left: drawable.x - 12,
        top: drawable.y - 12,
        width: 24,
        height: 24
      };
  }
}

function normalizeDrawPoint(start: Point, point: Point, axisLock: boolean): Point {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
