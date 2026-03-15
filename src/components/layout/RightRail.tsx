import type { Drawable, ExportJob, TacticalProject } from "../../types/domain";
import type { ActiveSidePanel, ActiveTool } from "../../types/ui";

interface RightRailProps {
  activeSidePanel: ActiveSidePanel;
  activeTool: ActiveTool;
  selectedCount: number;
  selectedDrawables: Drawable[];
  selectedSummary: string[];
  project: TacticalProject;
  exportJobs: ExportJob[];
  exportPreset: string;
  sceneNote: string;
  onSelectPanel: (panel: ActiveSidePanel) => void;
  onSetCourtType: (courtType: "full" | "half") => void;
  onSetExportPreset: (preset: string) => void;
  onQueueExport: () => void;
  onRefreshExports: () => void;
  onCancelExport: (jobId: string) => void;
  onRetryExport: (jobId: string) => void;
  onUpdateSelectionLabel: (label: string) => void;
  onUpdateSelectionStyle: (changes: { fill?: string; stroke?: string; opacity?: number; dashed?: boolean }) => void;
  onToggleSelectionLocked: () => void;
  onToggleSelectionHidden: () => void;
  onSetSceneNote: (value: string) => void;
}

const panelButtons: Array<{ id: ActiveSidePanel; label: string }> = [
  { id: "inspector", label: "Inspector" },
  { id: "text", label: "Text" },
  { id: "effects", label: "Effects" },
  { id: "notes", label: "Notes" },
  { id: "field", label: "Field" },
  { id: "export", label: "Export" }
];

export function RightRail({
  activeSidePanel,
  activeTool,
  selectedCount,
  selectedDrawables,
  selectedSummary,
  project,
  exportJobs,
  exportPreset,
  sceneNote,
  onSelectPanel,
  onSetCourtType,
  onSetExportPreset,
  onQueueExport,
  onRefreshExports,
  onCancelExport,
  onRetryExport,
  onUpdateSelectionLabel,
  onUpdateSelectionStyle,
  onToggleSelectionLocked,
  onToggleSelectionHidden,
  onSetSceneNote
}: RightRailProps) {
  const primarySelection = selectedDrawables[0] ?? null;
  const latestJob = exportJobs[0];
  const exportPresetLabel =
    {
      "720p30": "720p / 30fps",
      "1080p30": "1080p / 30fps",
      "1080p60": "1080p / 60fps"
    }[exportPreset] ?? exportPreset;

  return (
    <div className="inspector-shell">
      <div className="inspector-shell__tabs">
        {panelButtons.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={`panel-tab ${activeSidePanel === panel.id ? "is-active" : ""}`}
            onClick={() => onSelectPanel(panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {activeSidePanel === "inspector" ? (
        <section className="inspector-card">
          <h2>Inspector</h2>
          <p>
            {selectedCount === 0
              ? `Active tool: ${activeTool[0].toUpperCase() + activeTool.slice(1)}`
              : `${selectedCount} object${selectedCount === 1 ? "" : "s"} selected`}
          </p>
          {selectedSummary.length > 0 ? (
            <ul className="inspector-list">
              {selectedSummary.map((summary) => (
                <li key={summary}>{summary}</li>
              ))}
            </ul>
          ) : (
            <ul className="inspector-list">
              <li>Tool switching lives in the bottom dock.</li>
              <li>Shift+click adds or removes selection.</li>
              <li>Escape clears selection and cancels in-progress draw.</li>
            </ul>
          )}
        </section>
      ) : null}

      {activeSidePanel === "field" ? (
        <section className="inspector-card">
          <h2>Field Settings</h2>
          <p>Keep court setup here so the command bar stays focused on project actions.</p>
          <div className="panel-field">
            <span>Court Preset</span>
            <label className="select-shell">
              <span className="sr-only">Court preset</span>
              <select
                value={project.meta.courtType ?? "full"}
                onChange={(event) => onSetCourtType(event.target.value as "full" | "half")}
              >
                <option value="full">Full Court</option>
                <option value="half">Half Court</option>
              </select>
            </label>
          </div>
          <ul className="inspector-list">
            <li>Full court uses both penalty areas and substitution marks.</li>
            <li>Half court keeps the board tighter for set-piece rehearsal.</li>
          </ul>
        </section>
      ) : null}

      {activeSidePanel === "export" ? (
        <section className="inspector-card">
          <div className="inspector-card__header">
            <h2>Export Queue</h2>
            <div className="button-inline-row">
              <button type="button" className="button button--ghost" onClick={onRefreshExports}>
                Refresh
              </button>
              <button type="button" className="button button--accent" onClick={onQueueExport}>
                Queue
              </button>
            </div>
          </div>
          <div className="panel-field">
            <span>Export Preset</span>
            <label className="select-shell">
              <span className="sr-only">Export preset</span>
              <select value={exportPreset} onChange={(event) => onSetExportPreset(event.target.value)}>
                <option value="720p30">720p / 30fps</option>
                <option value="1080p30">1080p / 30fps</option>
                <option value="1080p60">1080p / 60fps</option>
              </select>
            </label>
          </div>
          <div className="export-job-list">
            {exportJobs.map((job) => (
              <article key={job.id} className="export-job-card">
                <div>
                  <strong>{job.id}</strong>
                  <p>
                    {job.status} · {job.progressPct}%
                  </p>
                  {job.outputPath ? <p>{job.outputPath}</p> : null}
                  {job.errorMessage ? <p>{job.errorMessage}</p> : null}
                </div>
                <div className="button-inline-row">
                  {(job.status === "queued" || job.status === "running" || job.status === "canceling") ? (
                    <button type="button" className="button button--ghost" onClick={() => onCancelExport(job.id)}>
                      Cancel
                    </button>
                  ) : null}
                  {(job.status === "failed" || job.status === "canceled") ? (
                    <button type="button" className="button" onClick={() => onRetryExport(job.id)}>
                      Retry
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {exportJobs.length === 0 ? <p>No jobs yet.</p> : null}
          </div>
          <div className="meta-card">
            <h3>Next Queue</h3>
            <p>{exportPresetLabel}</p>
            <p>{project.meta.name}</p>
          </div>
          {latestJob ? (
            <div className="meta-card">
              <h3>Latest Export</h3>
              <p>{latestJob.status} · {latestJob.progressPct}%</p>
              <p>{latestJob.resolution ?? "resolution pending"} · {latestJob.fps ?? 30} fps</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSidePanel === "text" ? (
        <section className="inspector-card">
          <h2>Text</h2>
          <p>{selectedCount === 0 ? "Select a drawable with a label to edit its copy." : "Edit the selected label or player tag."}</p>
          <label className="panel-field">
            <span>Label</span>
            <input
              type="text"
              value={primarySelection?.label ?? ""}
              onChange={(event) => onUpdateSelectionLabel(event.target.value)}
              disabled={selectedCount === 0}
            />
          </label>
          <label className="panel-field">
            <span>Fill</span>
            <input
              type="color"
              value={primarySelection?.style.fill ?? "#14b8a6"}
              onChange={(event) => onUpdateSelectionStyle({ fill: event.target.value })}
              disabled={selectedCount === 0}
            />
          </label>
        </section>
      ) : null}

      {activeSidePanel === "notes" ? (
        <section className="inspector-card">
          <h2>Notes</h2>
          <p>Offline scene notes stored locally for this board.</p>
          <label className="panel-field">
            <span>Coach note</span>
            <textarea rows={6} value={sceneNote} onChange={(event) => onSetSceneNote(event.target.value)} />
          </label>
        </section>
      ) : null}

      {activeSidePanel === "effects" ? (
        <section className="inspector-card">
          <h2>Effects</h2>
          <p>{selectedCount === 0 ? "Select an object to edit appearance and visibility." : "Adjust the selected object's presentation."}</p>
          <label className="panel-field">
            <span>Stroke</span>
            <input
              type="color"
              value={primarySelection?.style.stroke ?? "#111827"}
              onChange={(event) => onUpdateSelectionStyle({ stroke: event.target.value })}
              disabled={selectedCount === 0}
            />
          </label>
          <label className="panel-field">
            <span>Opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={primarySelection?.style.opacity ?? 1}
              onChange={(event) => onUpdateSelectionStyle({ opacity: Number(event.target.value) })}
              disabled={selectedCount === 0}
            />
          </label>
          <div className="button-inline-row">
            <button type="button" className="button button--ghost" onClick={() => onUpdateSelectionStyle({ dashed: !(primarySelection?.style.dashed ?? false) })} disabled={selectedCount === 0}>
              {(primarySelection?.style.dashed ?? false) ? "Solid Stroke" : "Dashed Stroke"}
            </button>
            <button type="button" className="button button--ghost" onClick={onToggleSelectionLocked} disabled={selectedCount === 0}>
              {primarySelection?.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" className="button button--ghost" onClick={onToggleSelectionHidden} disabled={selectedCount === 0}>
              {primarySelection?.hidden ? "Show" : "Hide"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
