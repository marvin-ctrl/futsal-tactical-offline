import type { ActiveTool, BottomDockTab } from "../../types/ui";

interface BottomDockProps {
  activeTool: ActiveTool;
  bottomTab: BottomDockTab;
  playbackMs: number;
  totalDurationMs: number;
  selectedCount: number;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ActiveTool) => void;
  onSetBottomTab: (tab: BottomDockTab) => void;
  onSetPlaybackMs: (value: number) => void;
  onPlayToggle: () => void;
  onResetPlayback: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const editTools: ActiveTool[] = ["select", "player", "goalkeeper", "ball", "cone", "arrow", "line", "zone", "label"];

export function BottomDock({
  activeTool,
  bottomTab,
  playbackMs,
  totalDurationMs,
  selectedCount,
  isPlaying,
  canUndo,
  canRedo,
  onSelectTool,
  onSetBottomTab,
  onSetPlaybackMs,
  onPlayToggle,
  onResetPlayback,
  onUndo,
  onRedo
}: BottomDockProps) {
  return (
    <div className="bottom-dock">
      <div className="bottom-dock__tabs">
        <button
          type="button"
          className={`dock-tab ${bottomTab === "edit" ? "is-active" : ""}`}
          onClick={() => onSetBottomTab("edit")}
        >
          Edit
        </button>
        <button
          type="button"
          className={`dock-tab ${bottomTab === "animation" ? "is-active" : ""}`}
          onClick={() => onSetBottomTab("animation")}
        >
          Animation
        </button>
      </div>

      {bottomTab === "edit" ? (
        <div className="bottom-dock__content bottom-dock__content--tools">
          <div className="tool-grid tool-grid--dock">
            {editTools.map((tool) => (
              <button
                key={tool}
                type="button"
                className={`tool-chip ${activeTool === tool ? "is-active" : ""}`}
                onClick={() => onSelectTool(tool)}
              >
                {tool}
              </button>
            ))}
          </div>
          <div className="dock-summary">{selectedCount} selected</div>
          <div className="button-inline-row">
            <button type="button" className="button button--ghost" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            <button type="button" className="button button--ghost" onClick={onRedo} disabled={!canRedo}>
              Redo
            </button>
          </div>
        </div>
      ) : null}

      {bottomTab === "animation" ? (
        <div className="bottom-dock__content bottom-dock__content--timeline">
          <div className="timeline-shell">
            <label htmlFor="timeline-range">Frame scrub</label>
            <input
              id="timeline-range"
              type="range"
              min={0}
              max={Math.max(totalDurationMs, 1000)}
              step={50}
              value={playbackMs}
              onChange={(event) => onSetPlaybackMs(Number(event.target.value))}
            />
            <span>
              {Math.round(playbackMs)} / {Math.round(totalDurationMs)} ms
            </span>
          </div>
          <div className="transport-row">
            <button type="button" className="button button--ghost" onClick={onResetPlayback}>
              Reset
            </button>
            <button type="button" className="button button--accent" onClick={onPlayToggle}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="status-pill">1x speed</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
