import { useEffect, useRef, useState } from "react";
import { AGE_BAND_OPTIONS, formatPlayLabel, PLAY_CATEGORY_OPTIONS, RESTART_TYPE_OPTIONS, SYSTEM_OPTIONS } from "../../lib/playMetadata";
import { getCourtTypeLabel } from "../../lib/uiLabels";
import type { AgeBand, ProjectMeta, ProjectRow, SystemType, TacticalProject } from "../../types/domain";

export type ProjectDialogMode = "manage" | "rename" | "saveAs";

interface ProjectDialogProps {
  mode: ProjectDialogMode;
  project: TacticalProject;
  projectRows: ProjectRow[];
  thumbnailById: Record<string, string | null>;
  persistStatus: string;
  loadStatus: string;
  onClose: () => void;
  onNewProject: () => void;
  onLoadProject: (projectId: string) => void;
  onOpenDashboard: () => void;
  onOpenDiagnostics: () => void;
  onExportPackage: () => void;
  onImportPackage: (file: File) => void | Promise<void>;
  onStartRename: () => void;
  onStartSaveAs: () => void;
  onRenameProject: (name: string) => void;
  onSaveProjectAs: (name: string) => void | Promise<void>;
  onUpdateProjectMeta: (changes: Partial<ProjectMeta>) => void;
}

const formatProjectTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function ProjectDialog({
  mode,
  project,
  projectRows,
  thumbnailById,
  persistStatus,
  loadStatus,
  onClose,
  onNewProject,
  onLoadProject,
  onOpenDashboard,
  onOpenDiagnostics,
  onExportPackage,
  onImportPackage,
  onStartRename,
  onStartSaveAs,
  onRenameProject,
  onSaveProjectAs,
  onUpdateProjectMeta
}: ProjectDialogProps) {
  const [name, setName] = useState(project.meta.name);
  const [description, setDescription] = useState(project.meta.description ?? "");
  const [category, setCategory] = useState(project.meta.category);
  const [restartType, setRestartType] = useState(project.meta.restartType);
  const [system, setSystem] = useState(project.meta.system ?? "");
  const [ageBand, setAgeBand] = useState(project.meta.ageBand ?? "");
  const [tagsInput, setTagsInput] = useState(project.meta.tags.join(", "));
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const isNamingMode = mode === "rename" || mode === "saveAs";

  useEffect(() => {
    setName(mode === "saveAs" ? `${project.meta.name} Copy` : project.meta.name);
  }, [mode, project.meta.name]);

  useEffect(() => {
    setDescription(project.meta.description ?? "");
    setCategory(project.meta.category);
    setRestartType(project.meta.restartType);
    setSystem(project.meta.system ?? "");
    setAgeBand(project.meta.ageBand ?? "");
    setTagsInput(project.meta.tags.join(", "));
  }, [project.meta]);

  useEffect(() => {
    if (isNamingMode) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isNamingMode, mode]);

  const submitLabel = mode === "rename" ? "Rename Play" : "Create Copy";

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
            <p className="eyebrow">Play Flow</p>
            <h2 id="project-dialog-title">
              {mode === "manage" ? "Play Manager" : mode === "rename" ? "Rename Play" : "Save Play As"}
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
                <p className="eyebrow">Current Play</p>
                <h3>{project.meta.name}</h3>
                <p>
                  {project.scenes.length} step{project.scenes.length === 1 ? "" : "s"} · {project.keyframes.length} keyframe
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
                  <strong>{getCourtTypeLabel(project.meta.courtType)}</strong>
                </article>
              </div>
            </section>

            <section className="project-dialog__section">
              <div className="project-dialog__actions">
                <button type="button" className="button button--accent" onClick={onNewProject}>
                  New Play
                </button>
                <button type="button" className="button button--ghost" onClick={onExportPackage}>
                  Export Package
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import Package
                </button>
                <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
                  Dashboard
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
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  void onImportPackage(file);
                  event.target.value = "";
                }}
              />
            </section>

            <section className="project-dialog__section">
              <div>
                <p className="eyebrow">Play Metadata</p>
                <h3>Organize this play for library search</h3>
              </div>
              <div className="project-dialog__meta-grid">
                <label className="panel-field project-dialog__meta-grid--full">
                  <span>Description</span>
                  <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>

                <label className="panel-field">
                  <span>Category</span>
                  <label className="select-shell">
                    <span className="sr-only">Category</span>
                    <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                      {PLAY_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatPlayLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </label>

                <label className="panel-field">
                  <span>Restart Type</span>
                  <label className="select-shell">
                    <span className="sr-only">Restart type</span>
                    <select value={restartType} onChange={(event) => setRestartType(event.target.value as typeof restartType)}>
                      {RESTART_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatPlayLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </label>

                <label className="panel-field">
                  <span>System</span>
                  <label className="select-shell">
                    <span className="sr-only">System</span>
                    <select value={system} onChange={(event) => setSystem(event.target.value)}>
                      <option value="">None</option>
                      {SYSTEM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </label>

                <label className="panel-field">
                  <span>Age Band</span>
                  <label className="select-shell">
                    <span className="sr-only">Age band</span>
                    <select value={ageBand} onChange={(event) => setAgeBand(event.target.value)}>
                      <option value="">None</option>
                      {AGE_BAND_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatPlayLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </label>

                <label className="panel-field project-dialog__meta-grid--full">
                  <span>Tags</span>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                    placeholder="press, pivot, second phase"
                  />
                </label>
              </div>
              <div className="project-dialog__footer">
                <span className="command-bar__meta">Template: {project.meta.sourceTemplateId ?? "custom play"}</span>
                <button
                  type="button"
                  className="button button--accent"
                  onClick={() =>
                    onUpdateProjectMeta({
                      description: description.trim(),
                      category,
                      restartType,
                      system: (system || undefined) as SystemType | undefined,
                      ageBand: (ageBand || undefined) as AgeBand | undefined,
                      tags: tagsInput
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                    })
                  }
                >
                  Save Metadata
                </button>
              </div>
            </section>

            <section className="project-dialog__section">
              <div>
                <p className="eyebrow">Saved Plays</p>
                <h3>Open existing work</h3>
              </div>
              <div className="project-list">
                {projectRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`project-row ${row.id === project.meta.id ? "is-active" : ""}`}
                    onClick={() => onLoadProject(row.id)}
                  >
                    <span className="project-row__thumb">
                      {thumbnailById[row.id] ? <img src={thumbnailById[row.id] ?? undefined} alt="" /> : <span>Play</span>}
                    </span>
                    <span className="project-row__meta">
                      <strong>{row.name}</strong>
                      <span>
                        {formatPlayLabel(row.category)} · {formatPlayLabel(row.restartType)} · {row.sceneCount} step
                        {row.sceneCount === 1 ? "" : "s"}
                      </span>
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
              <span>Play Name</span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter a play name"
              />
            </label>
            <p className="command-bar__meta">
              {mode === "rename"
                ? "Rename the current play without changing its project ID."
                : "Create a new play copy so the current work stays intact."}
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
