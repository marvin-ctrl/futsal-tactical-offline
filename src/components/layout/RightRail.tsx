import { useEffect, useState } from "react";
import type { CourtType, Drawable, ExportJob, ExportType, TacticalProject } from "../../types/domain";
import type { ActiveSidePanel, ActiveTool } from "../../types/ui";
import { getToolLabel } from "../../lib/uiLabels";

interface ExportPresetOption {
  value: string;
  label: string;
}

interface SceneDurationRow {
  id: string;
  label: string;
  name: string;
  durationMs: number;
  minDurationMs: number;
  isActive: boolean;
}

interface RightRailProps {
  activeSidePanel: ActiveSidePanel;
  activeTool: ActiveTool;
  selectedCount: number;
  selectedDrawables: Drawable[];
  selectedSummary: string[];
  project: TacticalProject;
  totalDurationMs: number;
  sceneDurations: SceneDurationRow[];
  exportJobs: ExportJob[];
  exportFormat: ExportType;
  exportPreset: string;
  exportPresetOptions: ExportPresetOption[];
  sceneNote: string;
  onSelectPanel: (panel: ActiveSidePanel) => void;
  onSetCourtType: (courtType: CourtType) => void;
  onSetExportFormat: (format: ExportType) => void;
  onSetExportPreset: (preset: string) => void;
  onSetSceneDuration: (sceneId: string, durationSeconds: number) => void;
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

function formatDurationSeconds(durationMs: number): string {
  return String(Math.max(1, Math.round(durationMs / 1000)));
}

export function RightRail({
  activeSidePanel,
  activeTool,
  selectedCount,
  selectedDrawables,
  selectedSummary,
  project,
  totalDurationMs,
  sceneDurations,
  exportJobs,
  exportFormat,
  exportPreset,
  exportPresetOptions,
  sceneNote,
  onSelectPanel,
  onSetCourtType,
  onSetExportFormat,
  onSetExportPreset,
  onSetSceneDuration,
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
    exportPresetOptions.find((option) => option.value === exportPreset)?.label ?? exportPreset;
  const [sceneDurationDrafts, setSceneDurationDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setSceneDurationDrafts(
      Object.fromEntries(sceneDurations.map((scene) => [scene.id, formatDurationSeconds(scene.durationMs)]))
    );
  }, [sceneDurations]);

  const commitSceneDuration = (sceneId: string) => {
    const scene = sceneDurations.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return;
    }

    const draft = sceneDurationDrafts[sceneId] ?? formatDurationSeconds(scene.durationMs);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSceneDurationDrafts((current) => ({
        ...current,
        [sceneId]: formatDurationSeconds(scene.durationMs)
      }));
      return;
    }

    onSetSceneDuration(sceneId, parsed);
  };

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
              ? `Active tool: ${getToolLabel(activeTool)}`
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
            <div className="field-mode-row" role="group" aria-label="Court preset">
              <button
                type="button"
                className={`button ${project.meta.courtType === "full" || !project.meta.courtType ? "button--accent" : "button--ghost"}`}
                onClick={() => onSetCourtType("full")}
              >
                Full
              </button>
              <button
                type="button"
                className={`button ${project.meta.courtType === "half-attacking" ? "button--accent" : "button--ghost"}`}
                onClick={() => onSetCourtType("half-attacking")}
              >
                Attack Focus
              </button>
              <button
                type="button"
                className={`button ${project.meta.courtType === "half-defending" ? "button--accent" : "button--ghost"}`}
                onClick={() => onSetCourtType("half-defending")}
              >
                Defend Focus
              </button>
            </div>
          </div>
          <div className="meta-card">
            <h3>Clip Length</h3>
            <p>
              {Math.round(totalDurationMs / 1000)}s across {sceneDurations.length} step{sceneDurations.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="scene-duration-list">
            {sceneDurations.map((scene) => (
              <div key={scene.id} className={`scene-duration-row ${scene.isActive ? "is-active" : ""}`}>
                <div className="scene-duration-row__header">
                  <div>
                    <strong>{scene.label}</strong>
                    <p className="scene-duration-row__name">{scene.name}</p>
                  </div>
                  {scene.isActive ? <span className="status-pill">Active</span> : null}
                </div>
                <label className="panel-field">
                  <span>Duration (seconds)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={sceneDurationDrafts[scene.id] ?? formatDurationSeconds(scene.durationMs)}
                    onChange={(event) =>
                      setSceneDurationDrafts((current) => ({
                        ...current,
                        [scene.id]: event.target.value
                      }))
                    }
                    onBlur={() => commitSceneDuration(scene.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                <p className="scene-duration-row__hint">
                  Minimum {Math.round(scene.minDurationMs / 1000)}s to keep the last keyframe reachable.
                </p>
              </div>
            ))}
          </div>
          <ul className="inspector-list">
            <li>Full court shows the complete futsal board with both penalty areas.</li>
            <li>Attacking Half Focus reframes the attacking half without changing the court geometry or stored positions.</li>
            <li>Defending Half Focus does the same for your own half so defensive spacing stays readable and accurate.</li>
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
                Queue {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
          <div className="panel-field">
            <span>Export Format</span>
            <label className="select-shell">
              <span className="sr-only">Export format</span>
              <select value={exportFormat} onChange={(event) => onSetExportFormat(event.target.value as ExportType)}>
                <option value="png">PNG Snapshot</option>
                <option value="pdf">PDF Snapshot</option>
                <option value="mp4">MP4 Animation</option>
              </select>
            </label>
          </div>
          <div className="panel-field">
            <span>Export Preset</span>
            <label className="select-shell">
              <span className="sr-only">Export preset</span>
              <select value={exportPreset} onChange={(event) => onSetExportPreset(event.target.value)}>
                {exportPresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="export-job-list">
            {exportJobs.map((job) => (
              <article key={job.id} className="export-job-card">
                <div>
                  <strong>
                    {job.exportType.toUpperCase()} · {job.id}
                  </strong>
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
            <p>
              {exportFormat.toUpperCase()} · {exportPresetLabel}
            </p>
            <p>{project.meta.name}</p>
          </div>
          {latestJob ? (
            <div className="meta-card">
              <h3>Latest Export</h3>
              <p>
                {latestJob.exportType.toUpperCase()} · {latestJob.status} · {latestJob.progressPct}%
              </p>
              <p>
                {latestJob.resolution ?? "resolution pending"}
                {latestJob.fps ? ` · ${latestJob.fps} fps` : ""}
              </p>
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
