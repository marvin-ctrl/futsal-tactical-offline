import type { ExportType, TacticalProject } from "../../types/domain";
import { getCourtTypeLabel } from "../../lib/uiLabels";

interface TopCommandBarProps {
  project: TacticalProject;
  exportStatus: string;
  persistStatus: string;
  exportFormat: ExportType;
  exportPresetLabel: string;
  onOpenProjectDialog: () => void;
  onSaveProject: () => void;
  onPresentPlay: () => void;
  onQueueExport: () => void;
  onOpenFieldPanel: () => void;
  onOpenExportPanel: () => void;
}

export function TopCommandBar({
  project,
  exportStatus,
  persistStatus,
  exportFormat,
  exportPresetLabel,
  onOpenProjectDialog,
  onSaveProject,
  onPresentPlay,
  onQueueExport,
  onOpenFieldPanel,
  onOpenExportPanel
}: TopCommandBarProps) {
  return (
    <div className="command-bar">
      <div className="command-bar__identity">
        <p className="eyebrow">Offline Play Studio</p>
        <h1>{project.meta.name}</h1>
        <p className="command-bar__meta">
          Schema v{project.meta.schemaVersion} · {project.scenes.length} step{project.scenes.length === 1 ? "" : "s"} · Saved:{" "}
          {persistStatus}
        </p>
      </div>

      <div className="command-bar__controls">
        <div className="command-group">
          <button type="button" className="button button--ghost" onClick={onOpenProjectDialog}>
            Play
          </button>
          <button type="button" className="button" onClick={onSaveProject}>
            Save
          </button>
        </div>

        <div className="command-group">
          <button type="button" className="button button--ghost" onClick={onOpenFieldPanel}>
            Field: {getCourtTypeLabel(project.meta.courtType)}
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenExportPanel}>
            Export: {exportFormat.toUpperCase()} · {exportPresetLabel}
          </button>
          <button type="button" className="button button--ghost" onClick={onPresentPlay}>
            Present
          </button>
          <button type="button" className="button button--accent" onClick={onQueueExport}>
            Queue {exportFormat.toUpperCase()} Export
          </button>
        </div>
      </div>

      <div className="command-bar__status">
        <span className="status-pill">
          {exportFormat.toUpperCase()} {exportPresetLabel}
        </span>
        <span className="status-pill">Export {exportStatus}</span>
      </div>
    </div>
  );
}
