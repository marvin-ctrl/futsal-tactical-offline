import type { CourtType, ExportJob, TacticalProject } from "../../types/domain";
import { TacticalCanvas } from "../TacticalCanvas";
import { getCourtTypeLongLabel } from "../../lib/uiLabels";

interface LegacyShellProps {
  project: TacticalProject;
  playbackMs: number;
  totalDurationMs: number;
  timelineIssues: string[];
  health: string;
  dbStatus: string;
  persistStatus: string;
  loadStatus: string;
  exportStatus: string;
  exportJobs: ExportJob[];
  isPlaying: boolean;
  onSetPlaybackMs: (value: number) => void;
  onPlayToggle: () => void;
  onResetPlayback: () => void;
  onCheckHealth: () => void;
  onInitDatabase: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onQueuePngExport: () => void;
  onQueuePdfExport: () => void;
  onQueueMp4Export: () => void;
  onRefreshExports: () => void;
  onSetCourtType: (courtType: CourtType) => void;
}

export function LegacyShell({
  project,
  playbackMs,
  totalDurationMs,
  timelineIssues,
  health,
  dbStatus,
  persistStatus,
  loadStatus,
  exportStatus,
  exportJobs,
  isPlaying,
  onSetPlaybackMs,
  onPlayToggle,
  onResetPlayback,
  onCheckHealth,
  onInitDatabase,
  onSaveProject,
  onLoadProject,
  onQueuePngExport,
  onQueuePdfExport,
  onQueueMp4Export,
  onRefreshExports,
  onSetCourtType
}: LegacyShellProps) {
  return (
    <main className="legacy-shell">
      <header className="top-bar">
        <div>
          <h1>Futsal Tactical Offline</h1>
          <p>Legacy shell fallback for incremental rollout.</p>
        </div>
      </header>

      <section className="panel">
        <h2>Project Seed</h2>
        <p>Name: {project.meta.name}</p>
        <p>Court: {getCourtTypeLongLabel(project.meta.courtType)}</p>
        <p>Scenes: {project.scenes.length}</p>
        <p>Keyframes: {project.keyframes.length}</p>
        <div className="button-row">
          <button type="button" onClick={() => onSetCourtType("full")}>
            Full Court
          </button>
          <button type="button" onClick={() => onSetCourtType("half-attacking")}>
            Attacking Half Focus
          </button>
          <button type="button" onClick={() => onSetCourtType("half-defending")}>
            Defending Half Focus
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Playback Probe</h2>
        <label htmlFor="legacy-playback">Playback (ms): {playbackMs}</label>
        <input
          id="legacy-playback"
          type="range"
          min={0}
          max={totalDurationMs}
          step={100}
          value={playbackMs}
          onChange={(event) => onSetPlaybackMs(Number(event.target.value))}
        />
        <div className="button-row">
          <button type="button" onClick={onPlayToggle}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={onResetPlayback}>
            Reset
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Live Tactical Preview</h2>
        <TacticalCanvas project={project} playbackMs={playbackMs} />
        {timelineIssues.length > 0 ? (
          <ul className="warning-list">
            {timelineIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <h2>Tauri Bridge</h2>
        <div className="button-row">
          <button type="button" onClick={onCheckHealth}>
            Check Runtime
          </button>
          <button type="button" onClick={onInitDatabase}>
            Init Local DB
          </button>
        </div>
        <p>Runtime: {health}</p>
        <p>Database: {dbStatus}</p>
      </section>

      <section className="panel">
        <h2>Persistence</h2>
        <div className="button-row">
          <button type="button" onClick={onSaveProject}>
            Save Project
          </button>
          <button type="button" onClick={onLoadProject}>
            Load Project
          </button>
        </div>
        <p>Save: {persistStatus}</p>
        <p>Load: {loadStatus}</p>
      </section>

      <section className="panel">
        <h2>Export</h2>
        <div className="button-row">
          <button type="button" onClick={onQueuePngExport}>
            Queue PNG Snapshot
          </button>
          <button type="button" onClick={onQueuePdfExport}>
            Queue PDF Snapshot
          </button>
          <button type="button" onClick={onQueueMp4Export}>
            Queue MP4 Export
          </button>
          <button type="button" onClick={onRefreshExports}>
            Refresh Jobs
          </button>
        </div>
        <p>Status: {exportStatus}</p>
        {exportJobs.length === 0 ? (
          <p>No export jobs found for this project.</p>
        ) : (
          <ul className="export-list">
            {exportJobs.map((job) => (
              <li key={job.id}>
                <strong>{job.id}</strong> - {job.status} ({job.progressPct}%)
                {job.outputPath ? ` - ${job.outputPath}` : ""}
                {job.errorMessage ? ` - ${job.errorMessage}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
