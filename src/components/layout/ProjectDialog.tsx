import { useEffect, useRef, useState } from "react";
import type { ProjectRow, TacticalProject } from "../../types/domain";

export type ProjectDialogMode = "manage" | "rename" | "saveAs";

interface ProjectDialogProps {
  mode: ProjectDialogMode;
  project: TacticalProject;
  projectRows: ProjectRow[];
  persistStatus: string;
  loadStatus: string;
  onClose: () => void;
  onNewProject: () => void;
  onLoadProject: (projectId: string) => void;
  onOpenDiagnostics: () => void;
  onStartRename: () => void;
  onStartSaveAs: () => void;
  onRenameProject: (name: string) => void;
  onSaveProjectAs: (name: string) => void | Promise<void>;
}

const formatProjectTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function ProjectDialog({
  mode,
  project,
  projectRows,
  persistStatus,
  loadStatus,
  onClose,
  onNewProject,
  onLoadProject,
  onOpenDiagnostics,
  onStartRename,
  onStartSaveAs,
  onRenameProject,
  onSaveProjectAs
}: ProjectDialogProps) {
  const [name, setName] = useState(project.meta.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isNamingMode = mode === "rename" || mode === "saveAs";

  useEffect(() => {
    setName(mode === "saveAs" ? `${project.meta.name} Copy` : project.meta.name);
  }, [mode, project.meta.name]);

  useEffect(() => {
    if (isNamingMode) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isNamingMode, mode]);

  const submitLabel = mode === "rename" ? "Rename Project" : "Create Copy";

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <div className="project-dialog__header">
          <div>
            <p className="eyebrow">Project Flow</p>
            <h2 id="project-dialog-title">
              {mode === "manage" ? "Project Manager" : mode === "rename" ? "Rename Project" : "Save Project As"}
            </h2>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {mode === "manage" ? (
          <>
            <section className="project-dialog__summary">
              <div>
                <p className="eyebrow">Current Board</p>
                <h3>{project.meta.name}</h3>
                <p>
                  {project.scenes.length} scene{project.scenes.length === 1 ? "" : "s"} · {project.keyframes.length} keyframe
                  {project.keyframes.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="project-dialog__stat-grid">
                <article className="project-stat">
                  <span>Status</span>
                  <strong>{persistStatus}</strong>
                </article>
                <article className="project-stat">
                  <span>Loaded</span>
                  <strong>{loadStatus}</strong>
                </article>
                <article className="project-stat">
                  <span>Court</span>
                  <strong>{project.meta.courtType === "half" ? "Half" : "Full"} Court</strong>
                </article>
              </div>
            </section>

            <section className="project-dialog__section">
              <div className="project-dialog__actions">
                <button type="button" className="button button--accent" onClick={onNewProject}>
                  New Board
                </button>
                <button type="button" className="button button--ghost" onClick={onStartRename}>
                  Rename
                </button>
                <button type="button" className="button button--ghost" onClick={onStartSaveAs}>
                  Save As
                </button>
                <button type="button" className="button button--ghost" onClick={onOpenDiagnostics}>
                  Diagnostics
                </button>
              </div>
            </section>

            <section className="project-dialog__section">
              <div>
                <p className="eyebrow">Saved Projects</p>
                <h3>Open Existing</h3>
              </div>
              <div className="project-list">
                {projectRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`project-row ${row.id === project.meta.id ? "is-active" : ""}`}
                    onClick={() => onLoadProject(row.id)}
                  >
                    <span className="project-row__meta">
                      <strong>{row.name}</strong>
                      <span>{formatProjectTimestamp(row.updatedAt)}</span>
                    </span>
                    <span>{row.id === project.meta.id ? "Current" : "Open"}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <form
            className="project-dialog__section"
            onSubmit={(event) => {
              event.preventDefault();
              const nextName = name.trim();
              if (!nextName) {
                return;
              }
              if (mode === "rename") {
                onRenameProject(nextName);
                return;
              }
              void onSaveProjectAs(nextName);
            }}
          >
            <label className="panel-field">
              <span>Project Name</span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter a project name"
              />
            </label>
            <p className="command-bar__meta">
              {mode === "rename"
                ? "Rename the current board without changing its project ID."
                : "Create a new project copy so the current board stays intact."}
            </p>
            <div className="project-dialog__footer">
              <button type="button" className="button button--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button button--accent">
                {submitLabel}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
