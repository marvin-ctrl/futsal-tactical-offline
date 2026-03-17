import type { ProjectRow } from "../../types/domain";
import type { LibraryFilters } from "./LibraryFiltersBar";
import { LibraryFiltersBar } from "./LibraryFiltersBar";
import { ProjectCard } from "./ProjectCard";

interface LibraryViewProps {
  plays: ProjectRow[];
  filters: LibraryFilters;
  thumbnailById: Record<string, string | null>;
  onChangeFilters: (filters: LibraryFilters) => void;
  onBack: () => void;
  onOpenPlay: (projectId: string) => void;
  onPresentPlay: (projectId: string) => void;
  onDuplicatePlay: (projectId: string) => void;
  onDeletePlay: (projectId: string) => void;
}

export function LibraryView({
  plays,
  filters,
  thumbnailById,
  onChangeFilters,
  onBack,
  onOpenPlay,
  onPresentPlay,
  onDuplicatePlay,
  onDeletePlay
}: LibraryViewProps) {
  return (
    <section className="home-shell">
      <header className="home-hero panel home-hero--compact">
        <div>
          <p className="eyebrow">Play Library</p>
          <h1>Saved plays</h1>
          <p className="home-hero__copy">Filter locally by category, restart, system, and age band.</p>
        </div>
        <div className="button-inline-row">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back to Dashboard
          </button>
        </div>
      </header>

      <section className="panel home-section">
        <LibraryFiltersBar filters={filters} onChange={onChangeFilters} />
      </section>

      <section className="panel home-section">
        <div className="home-section__header">
          <div>
            <p className="eyebrow">Results</p>
            <h2>{plays.length} play{plays.length === 1 ? "" : "s"}</h2>
          </div>
        </div>

        {plays.length === 0 ? (
          <div className="empty-state">No plays match the current filters.</div>
        ) : (
          <div className="play-grid">
            {plays.map((play) => (
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
