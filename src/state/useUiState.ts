import { create } from "zustand";
import { resolveViewportMode } from "../lib/layout";
import type { ActiveSidePanel, ActiveTool, AppView, BottomDockTab, DevDrawerState, ViewportMode } from "../types/ui";

interface UiState {
  appView: AppView;
  activeTool: ActiveTool;
  activeSidePanel: ActiveSidePanel;
  bottomTab: BottomDockTab;
  devDrawer: DevDrawerState;
  viewportMode: ViewportMode;
  shellVersion: "legacy" | "v2";
  rightRailWidth: number;
  bottomDockHeight: number;
  setAppView: (view: AppView) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setSidePanel: (panel: ActiveSidePanel) => void;
  setBottomTab: (tab: BottomDockTab) => void;
  toggleDevDrawer: () => void;
  setViewportMode: (width: number | ViewportMode) => void;
  setShellVersion: (version: "legacy" | "v2") => void;
  setRightRailWidth: (width: number) => void;
  setBottomDockHeight: (height: number) => void;
}

const initialShellVersion =
  typeof window !== "undefined"
    ? ((window.localStorage.getItem("ui.shellVersion") as "legacy" | "v2" | null) ?? "v2")
    : "v2";

const DEFAULT_RIGHT_RAIL_WIDTH = 292;
const DEFAULT_BOTTOM_DOCK_HEIGHT = 124;

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const useUiState = create<UiState>((set) => ({
  appView: "dashboard",
  activeTool: "select",
  activeSidePanel: "inspector",
  bottomTab: "edit",
  devDrawer: {
    open: false
  },
  viewportMode:
    typeof window !== "undefined" ? resolveViewportMode(window.innerWidth) : "wide",
  shellVersion: initialShellVersion,
  rightRailWidth: readStoredNumber("ui.rightRailWidth", DEFAULT_RIGHT_RAIL_WIDTH),
  bottomDockHeight: readStoredNumber("ui.bottomDockHeight", DEFAULT_BOTTOM_DOCK_HEIGHT),
  setAppView: (view) => set({ appView: view }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSidePanel: (panel) => set({ activeSidePanel: panel }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  toggleDevDrawer: () =>
    set((state) => ({
      devDrawer: {
        open: !state.devDrawer.open
      }
    })),
  setViewportMode: (value) =>
    set({ viewportMode: typeof value === "string" ? value : resolveViewportMode(value) }),
  setShellVersion: (version) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui.shellVersion", version);
    }
    set({ shellVersion: version });
  },
  setRightRailWidth: (width) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui.rightRailWidth", String(width));
    }
    set({ rightRailWidth: width });
  },
  setBottomDockHeight: (height) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui.bottomDockHeight", String(height));
    }
    set({ bottomDockHeight: height });
  }
}));
