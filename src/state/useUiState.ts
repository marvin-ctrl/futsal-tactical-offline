import { create } from "zustand";
import { resolveViewportMode } from "../lib/layout";
import type { ActiveSidePanel, ActiveTool, BottomDockTab, DevDrawerState, ViewportMode } from "../types/ui";

interface UiState {
  activeTool: ActiveTool;
  activeSidePanel: ActiveSidePanel;
  bottomTab: BottomDockTab;
  devDrawer: DevDrawerState;
  viewportMode: ViewportMode;
  shellVersion: "legacy" | "v2";
  setActiveTool: (tool: ActiveTool) => void;
  setSidePanel: (panel: ActiveSidePanel) => void;
  setBottomTab: (tab: BottomDockTab) => void;
  toggleDevDrawer: () => void;
  setViewportMode: (width: number | ViewportMode) => void;
  setShellVersion: (version: "legacy" | "v2") => void;
}

const initialShellVersion =
  typeof window !== "undefined"
    ? ((window.localStorage.getItem("ui.shellVersion") as "legacy" | "v2" | null) ?? "v2")
    : "v2";

export const useUiState = create<UiState>((set) => ({
  activeTool: "select",
  activeSidePanel: "tools",
  bottomTab: "edit",
  devDrawer: {
    open: false
  },
  viewportMode:
    typeof window !== "undefined" ? resolveViewportMode(window.innerWidth) : "wide",
  shellVersion: initialShellVersion,
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
  }
}));
