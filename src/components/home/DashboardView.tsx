import { QuickCreateGrid } from "./QuickCreateGrid";
import { ProjectCard } from "../library/ProjectCard";
import type { PlayTemplateDefinition } from "../../lib/projectTemplates";
import type { ProjectRow } from "../../types/domain";

interface DashboardViewProps {
  templates: PlayTemplateDefinition[];
  recentPlays: ProjectRow[];
  thumbnailById: Record<string, string | null>;
  onCreateFromTemplate: (templateId: string) => void;
  onOpenPlay: (projectId: string) => void;
  onPresentPlay: (projectId: string) => void;
  onDuplicatePlay: (projectId: string) => void;
  onDeletePlay: (projectId: string) => void;
  onOpenLibrary: () => void;
}

export function DashboardView({
  templates,
  recentPlays,
  thumbnailById,
  onCreateFromTemplate,
  onOpenPlay,
  onPresentPlay,
  onDuplicatePlay,
  onDeletePlay,
  onOpenLibrary
}: DashboardViewProps) {
  return (
    <section className="home-shell">
      <header className="home-hero panel">
        <div>
          <p className="eyebrow">Offline Futsal Studio</p>
          <h1>Build plays faster</h1>
          <p className="home-hero__copy">
            Start from a futsal template, keep your play library searchable, and stay ready for export without leaving the desktop app.
          </p>
        </div>
        <div className="button-inline-row">
          <button type="button" className="button" onClick={onOpenLibrary}>
            Open Library
          </button>
        </div>
      </header>

      <section className="panel home-section">
        <div className="home-section__header">
          <div>
            <p className="eyebrow">Quick Create</p>
            <h2>Start from a play template</h2>
          </div>
        </div>
        <QuickCreateGrid templates={templates} onCreateFromTemplate={onCreateFromTemplate} />
      </section>

      <section className="panel home-section">
        <div className="home-section__header">
          <div>
            <p className="eyebrow">Recent Plays</p>
            <h2>Jump back into recent work</h2>
          </div>
          <button type="button" className="button button--ghost" onClick={onOpenLibrary}>
            View All Plays
          </button>
        </div>

        {recentPlays.length === 0 ? (
          <div className="empty-state">No saved plays yet. Create one from a template above.</div>
        ) : (
          <div className="play-grid">
            {recentPlays.map((play) => (
              <ProjectCard
                key={play.id}
                play={play}
                thumbnailUrl={thumbnailById[play.id]}
                actionLabel="Open Play"
                onOpen={() => onOpenPlay(play.id)}
                onPresent={() => onPresentPlay(play.id)}
                onDuplicate={() => onDuplicatePlay(play.id)}
                onDelete={() => onDeletePlay(play.id)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
