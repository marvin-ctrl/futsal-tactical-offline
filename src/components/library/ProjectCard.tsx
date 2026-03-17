import type { ProjectRow } from "../../types/domain";
import { formatPlayLabel } from "../../lib/playMetadata";

interface ProjectCardProps {
  play: ProjectRow;
  thumbnailUrl?: string | null;
  actionLabel: string;
  onOpen: () => void;
  onPresent?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const formatUpdatedAt = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export function ProjectCard({ play, thumbnailUrl, actionLabel, onOpen, onPresent, onDuplicate, onDelete }: ProjectCardProps) {
  return (
    <article className="play-card">
      <div className="play-card__preview">
        {thumbnailUrl ? <img src={thumbnailUrl} alt={`${play.name} thumbnail`} /> : <div className="play-card__placeholder">No preview yet</div>}
      </div>
      <div className="play-card__body">
        <div className="play-card__header">
          <div>
            <h3>{play.name}</h3>
            {play.description ? <p>{play.description}</p> : <p className="play-card__muted">No description yet.</p>}
          </div>
          <div className="button-inline-row">
            <button type="button" className="button button--ghost" onClick={onDuplicate}>
              Duplicate
            </button>
            <button type="button" className="button button--ghost" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
        <div className="play-card__meta">
          <span className="status-pill">{formatPlayLabel(play.category)}</span>
          <span className="status-pill">{formatPlayLabel(play.restartType)}</span>
          {play.system ? <span className="status-pill">{play.system}</span> : null}
          {play.ageBand ? <span className="status-pill">{formatPlayLabel(play.ageBand)}</span> : null}
        </div>
        <div className="play-card__footer">
          <span>{play.sceneCount} step{play.sceneCount === 1 ? "" : "s"}</span>
          <span>{formatUpdatedAt(play.updatedAt)}</span>
        </div>
        <div className="button-inline-row">
          {onPresent ? (
            <button type="button" className="button button--ghost" onClick={onPresent}>
              Present
            </button>
          ) : null}
          <button type="button" className="button button--accent" onClick={onOpen}>
            {actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
