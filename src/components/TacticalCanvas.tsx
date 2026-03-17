import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  drawTacticalFrame,
  resolveCanvasFrameSize,
  resolveCourtRenderMapping,
  type CourtRenderMapping,
  type FramePoint
} from "../lib/canvasRenderer";
import {
  MIN_DRAW_DISTANCE,
  MOVE_THRESHOLD,
  buildCommittedDrawable,
  buildPreviewDrawable,
  collectDrawablesInRect,
  constrainDragDelta,
  createPlacementDrawable,
  getDrawableBounds,
  hitTestDrawables,
  moveDrawableChanges,
  normalizeDrawPoint,
  offsetDrawable,
  resolveMovableSelection,
  toggleSelection,
  type DrawTool,
  type Point
} from "../lib/editorInteractions";
import { sampleTimelineAt } from "../lib/timeline";
import type { Drawable, TacticalProject, UUID } from "../types/domain";
import type { ActiveTool, EditorCommand } from "../types/ui";

interface TacticalCanvasProps {
  project: TacticalProject;
  playbackMs: number;
  width?: number;
  height?: number;
  readOnly?: boolean;
  activeTool?: ActiveTool;
  selectedIds?: UUID[];
  interactionCancelToken?: number;
  onSelectIds?: (ids: UUID[]) => void;
  onCommand?: (command: EditorCommand, options?: { label?: string; selectionIds?: UUID[] }) => void;
  onAutoPause?: () => void;
}

const WORLD_CANVAS_SIZE = {
  width: 1000,
  height: 500
} as const;

type InteractionState =
  | { mode: "idle" }
  | { mode: "placing"; tool: ActiveTool; point: Point }
  | { mode: "marquee"; start: Point; current: Point; additive: boolean }
  | { mode: "dragging"; start: Point; current: Point; ids: UUID[] }
  | { mode: "drawing"; tool: DrawTool; start: Point; current: Point };

const DEFAULT_TOOL: ActiveTool = "select";

export function TacticalCanvas({
  project,
  playbackMs,
  width: fixedWidth,
  height: fixedHeight,
  readOnly = false,
  activeTool = DEFAULT_TOOL,
  selectedIds = [],
  interactionCancelToken,
  onSelectIds,
  onCommand,
  onAutoPause
}: TacticalCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldSize = WORLD_CANVAS_SIZE;
  const frameSize = useMemo(() => resolveCanvasFrameSize(project.meta.courtType ?? "full"), [project.meta.courtType]);
  const [displaySize, setDisplaySize] = useState({
    width: fixedWidth ?? frameSize.width,
    height: fixedHeight ?? frameSize.height
  });
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const renderMapping = useMemo(
    () => resolveCourtRenderMapping(project.meta.courtType ?? "full", frameSize.width, frameSize.height),
    [frameSize.height, frameSize.width, project.meta.courtType]
  );

  const sampledState = useMemo(() => sampleTimelineAt(project, playbackMs), [project, playbackMs]);

  const renderDrawables = useMemo(() => {
    let drawables = sampledState.drawables;

    if (interaction.mode === "dragging") {
      const delta = constrainDragDelta(
        sampledState.drawables,
        interaction.ids,
        {
          x: interaction.current.x - interaction.start.x,
          y: interaction.current.y - interaction.start.y
        },
        worldSize
      );
      drawables = drawables.map((drawable) => {
        if (!interaction.ids.includes(drawable.id)) {
          return drawable;
        }
        return offsetDrawable(drawable, delta);
      });
    }

    if (interaction.mode === "drawing") {
      drawables = [...drawables, buildPreviewDrawable(interaction.tool, interaction.start, interaction.current)];
    }

    return drawables;
  }, [interaction, sampledState.drawables, worldSize]);

  useLayoutEffect(() => {
    if (fixedWidth && fixedHeight) {
      setDisplaySize({ width: fixedWidth, height: fixedHeight });
    }
  }, [fixedHeight, fixedWidth]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || fixedWidth || fixedHeight) {
      return;
    }

    const aspectRatio = frameSize.width / frameSize.height;
    const resize = () => {
      const availableWidth = Math.max(240, Math.floor(wrapper.clientWidth));
      const availableHeight = Math.max(160, Math.floor(wrapper.clientHeight));
      const nextWidth = Math.min(availableWidth, Math.floor(availableHeight * aspectRatio));
      const nextHeight = Math.max(160, Math.floor(nextWidth / aspectRatio));
      setDisplaySize({
        width: nextWidth,
        height: nextHeight
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fixedHeight, fixedWidth, frameSize.height, frameSize.width]);

  useEffect(() => {
    setInteraction({ mode: "idle" });
  }, [interactionCancelToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(frameSize.width * ratio);
    canvas.height = Math.floor(frameSize.height * ratio);
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTacticalFrame(context, {
      width: frameSize.width,
      height: frameSize.height,
      courtType: project.meta.courtType ?? "full",
      drawables: renderDrawables
    });

    context.save();
    if (project.meta.courtType && project.meta.courtType !== "full") {
      context.beginPath();
      context.rect(
        renderMapping.contentRect.x,
        renderMapping.contentRect.y,
        renderMapping.contentRect.width,
        renderMapping.contentRect.height
      );
      context.clip();
    }
    renderMapping.applyToContext(context);
    drawSelectionOverlay(context, renderDrawables, selectedIds);

    if (interaction.mode === "marquee") {
      drawMarqueeOverlay(context, interaction.start, interaction.current);
    }
    context.restore();
  }, [
    displaySize.height,
    displaySize.width,
    frameSize.height,
    frameSize.width,
    interaction,
    project.meta.courtType,
    renderDrawables,
    renderMapping,
    selectedIds
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly) {
      return;
    }
    const point = resolveCanvasPoint(event, canvasRef.current, renderMapping);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === "select") {
      const hit = hitTestDrawables(sampledState.drawables, point);
      if (hit) {
        if (event.shiftKey) {
          onSelectIds?.(toggleSelection(selectedIds, hit.id));
          setInteraction({ mode: "idle" });
          return;
        }

        const nextSelection = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
        const moveIds = resolveMovableSelection(sampledState.drawables, nextSelection);
        onSelectIds?.(nextSelection);
        if (!hit.locked && moveIds.includes(hit.id)) {
          setInteraction({
            mode: "dragging",
            start: point,
            current: point,
            ids: moveIds
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

    if (
      activeTool === "run" ||
      activeTool === "pass" ||
      activeTool === "dribble" ||
      activeTool === "arrow" ||
      activeTool === "line" ||
      activeTool === "zone"
    ) {
      onAutoPause?.();
      setInteraction({
        mode: "drawing",
        tool: activeTool as DrawTool,
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
    if (readOnly) {
      return;
    }
    const point = resolveCanvasPoint(event, canvasRef.current, renderMapping);
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
    if (readOnly) {
      return;
    }
    const point = resolveCanvasPoint(event, canvasRef.current, renderMapping);
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
      const delta = constrainDragDelta(
        sampledState.drawables,
        interaction.ids,
        {
          x: point.x - interaction.start.x,
          y: point.y - interaction.start.y
        },
        worldSize
      );
      if (Math.hypot(delta.x, delta.y) >= MOVE_THRESHOLD && interaction.ids.length > 0) {
        onCommand?.(
          {
            type: "updateDrawables",
            updates: interaction.ids.map((id) => {
              const drawable = sampledState.drawables.find((candidate) => candidate.id === id);
              return {
                id,
                changes: drawable ? moveDrawableChanges(drawable, delta) : {}
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
      const endPoint = normalizeDrawPoint(interaction.start, point, event.shiftKey);
      if (Math.hypot(endPoint.x - interaction.start.x, endPoint.y - interaction.start.y) >= MIN_DRAW_DISTANCE) {
        const drawable = buildCommittedDrawable(interaction.tool, interaction.start, endPoint);
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
        onPointerCancel={() => setInteraction({ mode: "idle" })}
      />
    </div>
  );
}

function resolveCanvasPoint(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  mapping: CourtRenderMapping
): Point | null {
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const framePoint: FramePoint = {
    x: ((event.clientX - rect.left) / rect.width) * mapping.frameWidth,
    y: ((event.clientY - rect.top) / rect.height) * mapping.frameHeight
  };
  return mapping.frameToWorld(framePoint);
}

function commitPlacement(
  tool: ActiveTool,
  point: Point,
  onCommand: TacticalCanvasProps["onCommand"],
  onSelectIds: TacticalCanvasProps["onSelectIds"]
) {
  const drawable = createPlacementDrawable(tool, point);
  if (!drawable) {
    return;
  }

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

function drawSelectionOverlay(context: CanvasRenderingContext2D, drawables: Drawable[], selectedIds: UUID[]) {
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
    const bounds = getDrawableBounds(drawable, 6);
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
