import { useEffect, useMemo, useState } from "react";
import { TacticalCanvas } from "../TacticalCanvas";
import { listScenePlaybackWindows, sampleTimelineAt } from "../../lib/timeline";
import { getCourtTypeLongLabel } from "../../lib/uiLabels";
import type { TacticalProject } from "../../types/domain";

interface PresentationViewProps {
  project: TacticalProject;
  initialPlaybackMs: number;
  onExit: (playbackMs: number) => void;
}

const PLAYBACK_TICK_MS = 60;
const PLAYBACK_RATE_OPTIONS = [0.75, 1, 1.5] as const;

export function PresentationView({ project, initialPlaybackMs, onExit }: PresentationViewProps) {
  const scenes = useMemo(() => listScenePlaybackWindows(project), [project]);
  const totalDurationMs = scenes[scenes.length - 1]?.endMs ?? 0;
  const [playbackMs, setPlaybackMs] = useState(initialPlaybackMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  useEffect(() => {
    const bounded = Math.min(Math.max(0, initialPlaybackMs), totalDurationMs);
    setPlaybackMs(bounded);
    setIsPlaying(false);
  }, [initialPlaybackMs, project.meta.id, totalDurationMs]);

  useEffect(() => {
    if (!isPlaying || totalDurationMs <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPlaybackMs((current) => {
        const next = Math.min(totalDurationMs, current + Math.round(PLAYBACK_TICK_MS * playbackRate));
        if (next >= totalDurationMs) {
          setIsPlaying(false);
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, playbackRate, totalDurationMs]);

  const sampledState = useMemo(() => sampleTimelineAt(project, playbackMs), [project, playbackMs]);
  const activeSceneIndex = useMemo(() => {
    if (scenes.length === 0) {
      return 0;
    }
    const bounded = Math.max(0, playbackMs);
    const matchIndex = scenes.findIndex((scene) => bounded < scene.endMs);
    return matchIndex === -1 ? scenes.length - 1 : matchIndex;
  }, [playbackMs, scenes]);
  const activeScene = scenes[activeSceneIndex] ?? null;
  const sceneElapsedMs = activeScene ? Math.max(0, playbackMs - activeScene.startMs) : 0;
  const sceneProgress = activeScene ? Math.min(1, sceneElapsedMs / Math.max(activeScene.durationMs, 1)) : 0;
  const overallProgress = totalDurationMs > 0 ? Math.min(1, playbackMs / totalDurationMs) : 0;

  const jumpToScene = (index: number) => {
    const scene = scenes[index];
    if (!scene) {
      return;
    }
    setPlaybackMs(scene.startMs);
    setIsPlaying(false);
  };

  const stepScene = (direction: -1 | 1) => {
    if (scenes.length === 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(scenes.length - 1, activeSceneIndex + direction));
    jumpToScene(nextIndex);
  };

  const togglePlayback = () => {
    if (totalDurationMs <= 0) {
      return;
    }
    if (playbackMs >= totalDurationMs) {
      setPlaybackMs(0);
    }
    setIsPlaying((current) => !current);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onExit(playbackMs);
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepScene(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepScene(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit, playbackMs, scenes.length, totalDurationMs]);

  return (
    <section className="presentation-shell">
      <header className="presentation-shell__header panel">
        <div className="presentation-shell__copy">
          <p className="eyebrow">Presentation Mode</p>
          <h1>{project.meta.name}</h1>
          <p className="presentation-shell__meta">
            {activeScene?.sceneName ?? sampledState.activeSceneName ?? "No active step"} · Step {Math.min(activeSceneIndex + 1, Math.max(scenes.length, 1))} of{" "}
            {Math.max(scenes.length, 1)}
          </p>
        </div>
        <div className="button-inline-row">
          <span className="status-pill">{getCourtTypeLongLabel(project.meta.courtType)}</span>
          <button type="button" className="button button--ghost" onClick={() => onExit(playbackMs)}>
            Exit Presentation
          </button>
        </div>
      </header>

      <div className="presentation-shell__stage panel">
        <div className="presentation-shell__board">
          <TacticalCanvas project={project} playbackMs={playbackMs} selectedIds={[]} readOnly />
        </div>
      </div>

      <footer className="presentation-shell__footer panel">
        <div className="presentation-shell__transport">
          <div className="presentation-shell__progress-block">
            <div className="presentation-shell__progress presentation-shell__progress--scene">
              <span style={{ width: `${sceneProgress * 100}%` }} />
            </div>
            <div className="presentation-shell__progress presentation-shell__progress--overall">
              <span style={{ width: `${overallProgress * 100}%` }} />
            </div>
            <p className="presentation-shell__meta">
              Scene {Math.round(sceneElapsedMs)} / {Math.round(activeScene?.durationMs ?? 0)} ms · Timeline {Math.round(playbackMs)} / {Math.round(totalDurationMs)} ms
            </p>
          </div>

          <div className="button-inline-row">
            <button type="button" className="button button--ghost" onClick={() => stepScene(-1)} disabled={activeSceneIndex === 0}>
              Previous Step
            </button>
            <button type="button" className="button button--ghost" onClick={() => { setPlaybackMs(0); setIsPlaying(false); }}>
              Reset
            </button>
            <button type="button" className="button button--accent" onClick={togglePlayback} disabled={totalDurationMs <= 0}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => stepScene(1)}
              disabled={activeSceneIndex >= scenes.length - 1}
            >
              Next Step
            </button>
          </div>

          <div className="button-inline-row">
            {PLAYBACK_RATE_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`button ${playbackRate === rate ? "button--accent" : "button--ghost"}`}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="presentation-scene-strip" aria-label="Presentation steps">
          {scenes.map((scene, index) => (
            <button
              key={scene.sceneId}
              type="button"
              className={`presentation-scene ${index === activeSceneIndex ? "is-active" : ""}`}
              onClick={() => jumpToScene(index)}
            >
              <strong>Step {index + 1}</strong>
              <span>{scene.sceneName}</span>
              <span>{Math.round(scene.durationMs / 1000)}s</span>
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}
