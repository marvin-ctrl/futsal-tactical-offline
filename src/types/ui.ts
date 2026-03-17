import type { Drawable, UUID } from "./domain";

export type ActiveTool =
  | "select"
  | "player"
  | "goalkeeper"
  | "ball"
  | "cone"
  | "run"
  | "pass"
  | "dribble"
  | "arrow"
  | "line"
  | "zone"
  | "label";

export type AppView = "dashboard" | "library" | "editor" | "presentation";

export interface SelectionState {
  ids: UUID[];
}

export type ActiveSidePanel = "inspector" | "field" | "text" | "notes" | "effects" | "export";

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
