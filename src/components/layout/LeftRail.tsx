import type { ActiveSidePanel } from "../../types/ui";

interface LeftRailProps {
  activeSidePanel: ActiveSidePanel;
  onSelectPanel: (panel: ActiveSidePanel) => void;
  onToggleDevDrawer: () => void;
}

const leftRailItems: Array<{ id: ActiveSidePanel; label: string; hint: string }> = [
  { id: "boards", label: "Workspace", hint: "Current board context" },
  { id: "projects", label: "Projects", hint: "Open saved work" },
  { id: "field", label: "Field", hint: "Court settings" },
  { id: "export", label: "Export", hint: "Jobs and output" }
];

export function LeftRail({ activeSidePanel, onSelectPanel, onToggleDevDrawer }: LeftRailProps) {
  return (
    <div className="side-rail">
      <div className="side-rail__stack">
        {leftRailItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-button ${activeSidePanel === item.id ? "is-active" : ""}`}
            onClick={() => onSelectPanel(item.id)}
          >
            <span className="rail-button__label">{item.label}</span>
            <span className="rail-button__hint">{item.hint}</span>
          </button>
        ))}
      </div>

      <button type="button" className="rail-button rail-button--secondary" onClick={onToggleDevDrawer}>
        <span className="rail-button__label">Dev</span>
        <span className="rail-button__hint">Runtime and DB</span>
      </button>
    </div>
  );
}
