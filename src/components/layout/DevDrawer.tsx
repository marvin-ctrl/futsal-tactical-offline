import type { ExportJob } from "../../types/domain";

interface DevDrawerProps {
  isOpen: boolean;
  health: string;
  dbStatus: string;
  persistStatus: string;
  loadStatus: string;
  exportStatus: string;
  exportJobs: ExportJob[];
  shellVersion: "legacy" | "v2";
  onCheckHealth: () => void;
  onInitDatabase: () => void;
  onSetShellVersion: (version: "legacy" | "v2") => void;
  onClose: () => void;
}

export function DevDrawer({
  isOpen,
  health,
  dbStatus,
  persistStatus,
  loadStatus,
  exportStatus,
  exportJobs,
  shellVersion,
  onCheckHealth,
  onInitDatabase,
  onSetShellVersion,
  onClose
}: DevDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="dev-drawer" role="dialog" aria-modal="false" aria-label="Developer diagnostics">
      <div className="dev-drawer__header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2>Dev Drawer</h2>
        </div>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="dev-drawer__grid">
        <section className="inspector-card">
          <h3>Runtime</h3>
          <p>Runtime: {health}</p>
          <p>Database: {dbStatus}</p>
          <div className="button-inline-row">
            <button type="button" className="button button--ghost" onClick={onCheckHealth}>
              Check Runtime
            </button>
            <button type="button" className="button button--ghost" onClick={onInitDatabase}>
              Init DB
            </button>
          </div>
        </section>

        <section className="inspector-card">
          <h3>Shell</h3>
          <p>Shortcut: Cmd/Ctrl + .</p>
          <div className="button-inline-row">
            <button
              type="button"
              className={`button ${shellVersion === "v2" ? "button--accent" : "button--ghost"}`}
              onClick={() => onSetShellVersion("v2")}
            >
              V2 Shell
            </button>
            <button
              type="button"
              className={`button ${shellVersion === "legacy" ? "button--accent" : "button--ghost"}`}
              onClick={() => onSetShellVersion("legacy")}
            >
              Legacy Shell
            </button>
          </div>
        </section>

        <section className="inspector-card">
          <h3>Persistence</h3>
          <p>Save: {persistStatus}</p>
          <p>Load: {loadStatus}</p>
          <p>Export: {exportStatus}</p>
        </section>

        <section className="inspector-card">
          <h3>Recent Jobs</h3>
          <ul className="inspector-list">
            {exportJobs.slice(0, 4).map((job) => (
              <li key={job.id}>
                {job.id} · {job.status} · {job.progressPct}%
              </li>
            ))}
            {exportJobs.length === 0 ? <li>No jobs yet.</li> : null}
          </ul>
        </section>
      </div>
    </aside>
  );
}
