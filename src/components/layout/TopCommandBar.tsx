import type { ProjectRow, TacticalProject } from "../../types/domain";

interface TopCommandBarProps {
  project: TacticalProject;
  exportStatus: string;
  persistStatus: string;
  projectRows: ProjectRow[];
  onNewProject: () => void;
  onSaveProject: () => void;
  onLoadProject: (projectId: string) => void;
  onQueueExport: () => void;
  onSetCourtType: (courtType: "full" | "half") => void;
}

export function TopCommandBar({
  project,
  exportStatus,
  persistStatus,
  projectRows,
  onNewProject,
  onSaveProject,
  onLoadProject,
  onQueueExport,
  onSetCourtType
}: TopCommandBarProps) {
  return (
    <div className="command-bar">
      <div className="command-bar__identity">
        <p className="eyebrow">Offline Tactical Studio</p>
        <h1>{project.meta.name}</h1>
        <p className="command-bar__meta">
          Schema v{project.meta.schemaVersion} · {project.scenes.length} scene{project.scenes.length === 1 ? "" : "s"} · {persistStatus}
        </p>
      </div>

      <div className="command-bar__controls">
        <div className="command-group">
          <button type="button" className="button button--ghost" onClick={onNewProject}>
            New
          </button>
          <button type="button" className="button" onClick={onSaveProject}>
            Save
          </button>
          <label className="select-shell">
            <span className="sr-only">Open project</span>
            <select value={project.meta.id} onChange={(event) => onLoadProject(event.target.value)}>
              {projectRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="command-group">
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
          <button type="button" className="button button--accent" onClick={onQueueExport}>
            Queue MP4 Export
          </button>
        </div>
      </div>

      <div className="command-bar__status">
        <span className="status-pill">Export {exportStatus}</span>
      </div>
    </div>
  );
}
