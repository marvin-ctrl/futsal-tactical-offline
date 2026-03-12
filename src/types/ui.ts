import type { Drawable, UUID } from "./domain";

export type ActiveTool =
  | "select"
  | "player"
  | "goalkeeper"
  | "ball"
  | "cone"
  | "arrow"
  | "line"
  | "zone"
  | "label";

export interface SelectionState {
  ids: UUID[];
}

export interface TransformState {
  mode: "idle" | "marquee" | "dragging" | "drawing";
  originX?: number;
  originY?: number;
  currentX?: number;
  currentY?: number;
}

export type ActiveSidePanel =
  | "tools"
  | "inspector"
  | "boards"
  | "projects"
  | "field"
  | "text"
  | "notes"
  | "effects"
  | "export";

export type BottomDockTab = "edit" | "animation";

export type ViewportMode = "wide" | "compact" | "fallback";

export interface DevDrawerState {
  open: boolean;
}

export type EditorCommand =
  | {
      type: "batch";
      label: string;
      commands: EditorCommand[];
    }
  | {
      type: "addDrawables";
      drawables: Drawable[];
    }
  | {
      type: "updateDrawables";
      updates: Array<{
        id: UUID;
        changes: Partial<Drawable>;
      }>;
    }
  | {
      type: "removeDrawables";
      ids: UUID[];
    }
  | {
      type: "setDrawableState";
      drawableState: Record<UUID, Drawable>;
    };
