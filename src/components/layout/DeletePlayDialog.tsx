import type { ProjectRow } from "../../types/domain";

interface DeletePlayDialogProps {
  play: ProjectRow;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeletePlayDialog({ play, onCancel, onConfirm }: DeletePlayDialogProps) {
  return (
    <div
      className="modal-scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-play-title">
        <div className="project-dialog__header">
          <div>
            <p className="eyebrow">Delete Play</p>
            <h2 id="delete-play-title">Remove {play.name}?</h2>
          </div>
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <section className="project-dialog__section">
          <p className="command-bar__meta">
            This removes the play from the local library and deletes its saved scenes, keyframes, and export records from the desktop database.
          </p>
          <div className="project-dialog__footer">
            <button type="button" className="button button--ghost" onClick={onCancel}>
              Keep Play
            </button>
            <button type="button" className="button button--accent" onClick={onConfirm}>
              Delete Play
            </button>
          </div>
        </section>
      </section>
    </div>
  );
}
