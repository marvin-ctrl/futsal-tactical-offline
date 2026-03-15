import type { ExportJob, ProjectRow, TacticalProject } from "../../types/domain";
import type { ActiveSidePanel, ActiveTool } from "../../types/ui";

interface RightRailProps {
  activeSidePanel: ActiveSidePanel;
  activeTool: ActiveTool;
  selectedCount: number;
  selectedSummary: string[];
  project: TacticalProject;
  projectRows: ProjectRow[];
  exportJobs: ExportJob[];
  loadStatus: string;
  onSelectPanel: (panel: ActiveSidePanel) => void;
  onLoadProject: (projectId: string) => void;
  onQueueExport: () => void;
  onRefreshExports: () => void;
  onCancelExport: (jobId: string) => void;
  onRetryExport: (jobId: string) => void;
}

const panelButtons: Array<{ id: ActiveSidePanel; label: string }> = [
  { id: "tools", label: "Tools" },
  { id: "inspector", label: "Inspector" },
  { id: "text", label: "Text" },
  { id: "notes", label: "Notes" },
  { id: "effects", label: "Effects" }
];

export function RightRail({
  activeSidePanel,
  activeTool,
  selectedCount,
  selectedSummary,
  project,
  projectRows,
  exportJobs,
  loadStatus,
  onSelectPanel,
  onLoadProject,
  onQueueExport,
  onRefreshExports,
  onCancelExport,
  onRetryExport
}: RightRailProps) {
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

      {activeSidePanel === "tools" ? (
        <section className="inspector-card">
          <h2>Tool Context</h2>
          <p>Active tool: {activeTool[0].toUpperCase() + activeTool.slice(1)}</p>
          <p>Tool switching lives in the bottom dock so the shell only shows one edit palette at a time.</p>
          <ul className="inspector-list">
            <li>Select: click to select, drag empty space to marquee.</li>
            <li>Shift+click: add or remove from selection.</li>
            <li>Escape clears selection and cancels an in-progress draw.</li>
          </ul>
        </section>
      ) : null}

      {activeSidePanel === "inspector" ? (
        <section className="inspector-card">
          <h2>Inspector</h2>
          <p>{selectedCount === 0 ? "No selection" : `${selectedCount} object${selectedCount === 1 ? "" : "s"} selected`}</p>
          {selectedSummary.length > 0 ? (
            <ul className="inspector-list">
              {selectedSummary.map((summary) => (
                <li key={summary}>{summary}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {activeSidePanel === "boards" || activeSidePanel === "projects" ? (
        <section className="inspector-card">
          <h2>{activeSidePanel === "boards" ? "Boards" : "Project Library"}</h2>
          <p>{loadStatus}</p>
          <div className="project-list">
            {projectRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`project-row ${row.id === project.meta.id ? "is-active" : ""}`}
                onClick={() => onLoadProject(row.id)}
              >
                <span>{row.name}</span>
                <span>{row.updatedAt}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeSidePanel === "field" ? (
        <section className="inspector-card">
          <h2>Field Notes</h2>
          <p>{project.meta.courtType === "half" ? "Half-court preset" : "Full-court preset"}</p>
          <p>Minimum desktop target: 1366x768. Pitch stays centered and unobstructed.</p>
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
          <div className="export-job-list">
            {exportJobs.map((job) => (
              <article key={job.id} className="export-job-card">
                <div>
                  <strong>{job.id}</strong>
                  <p>
                    {job.status} · {job.progressPct}%
                  </p>
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
        </section>
      ) : null}

      {activeSidePanel === "text" || activeSidePanel === "notes" || activeSidePanel === "effects" ? (
        <section className="inspector-card">
          <h2>{activeSidePanel[0].toUpperCase() + activeSidePanel.slice(1)}</h2>
          <p>Reserved for Milestone 3 expansion. The shell is wired so the panel can fill in without layout churn.</p>
        </section>
      ) : null}
    </div>
  );
}
