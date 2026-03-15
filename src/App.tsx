import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TacticalCanvas } from "./components/TacticalCanvas";
import { AppFrame } from "./components/layout/AppFrame";
import { BottomDock } from "./components/layout/BottomDock";
import { DevDrawer } from "./components/layout/DevDrawer";
import { LeftRail } from "./components/layout/LeftRail";
import { RightRail } from "./components/layout/RightRail";
import { TopCommandBar } from "./components/layout/TopCommandBar";
import { LegacyShell } from "./components/shell/LegacyShell";
import { defaultProject } from "./lib/defaultProject";
import { createId, CURRENT_SCHEMA_VERSION, migrateProjectToCurrent } from "./lib/projectSchema";
import { sampleTimelineAt, timelineSanityIssues } from "./lib/timeline";
import { useEditorState } from "./state/useEditorState";
import { useUiState } from "./state/useUiState";
import type { Drawable, ExportJob, Mp4ExportRequest, ProjectRow, TacticalProject } from "./types/domain";
import type { ActiveTool } from "./types/ui";

const PROJECT_FALLBACK_ROW = (project: TacticalProject): ProjectRow => ({
  id: project.meta.id,
  name: project.meta.name,
  updatedAt: project.meta.updatedAt
});

export function App() {
  const {
    project,
    playbackMs,
    selection,
    activeKeyframeId,
    undoStack,
    redoStack,
    setPlaybackMs,
    advancePlaybackMs,
    setProject,
    resetHistory,
    setSelection,
    clearSelection,
    applyCommand,
    undo,
    redo
  } = useEditorState();
  const {
    activeTool,
    activeSidePanel,
    bottomTab,
    devDrawer,
    viewportMode,
    shellVersion,
    setActiveTool,
    setSidePanel,
    setBottomTab,
    toggleDevDrawer,
    setViewportMode,
    setShellVersion
  } = useUiState();

  const [health, setHealth] = useState("not checked");
  const [dbStatus, setDbStatus] = useState("not initialized");
  const [persistStatus, setPersistStatus] = useState("not saved");
  const [loadStatus, setLoadStatus] = useState("not loaded");
  const [exportStatus, setExportStatus] = useState("not queued");
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [interactionCancelToken, setInteractionCancelToken] = useState(0);

  const totalDurationMs = useMemo(
    () => project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
    [project]
  );
  const timelineIssues = useMemo(() => timelineSanityIssues(project), [project]);
  const sampledState = useMemo(() => sampleTimelineAt(project, playbackMs), [project, playbackMs]);
  const selectedDrawables = useMemo(
    () => sampledState.drawables.filter((drawable) => selection.ids.includes(drawable.id)),
    [sampledState.drawables, selection.ids]
  );
  const timelineKeyframes = useMemo(() => {
    const sceneStartById = new Map<string, number>();
    let cursor = 0;

    [...project.scenes]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .forEach((scene) => {
        sceneStartById.set(scene.id, cursor);
        cursor += scene.durationMs;
      });

    return project.keyframes
      .map((keyframe) => ({
        id: keyframe.id,
        playbackMs: (sceneStartById.get(keyframe.sceneId) ?? 0) + keyframe.timestampMs
      }))
      .sort((left, right) => left.playbackMs - right.playbackMs);
  }, [project]);
  const projectRowsForUi = projectRows.length > 0 ? projectRows : [PROJECT_FALLBACK_ROW(project)];
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const checkHealth = async () => {
    try {
      const result = await invoke<string>("healthcheck");
      setHealth(result);
    } catch {
      setHealth("web mode only");
    }
  };

  const initDatabase = async () => {
    try {
      const result = await invoke<string>("init_database");
      setDbStatus(result);
      await refreshProjects();
    } catch {
      setDbStatus("web mode only");
    }
  };

  const refreshProjects = async () => {
    try {
      const rows = await invoke<ProjectRow[]>("list_projects");
      setProjectRows(rows);
    } catch {
      setProjectRows([PROJECT_FALLBACK_ROW(project)]);
    }
  };

  const saveProjectToLocal = async () => {
    try {
      const result = await invoke<string>("save_project", { project });
      setPersistStatus(result);
      resetHistory();
      await refreshProjects();
    } catch {
      setPersistStatus("save unavailable in web mode");
    }
  };

  const loadProjectFromLocal = async (projectId = project.meta.id) => {
    try {
      const loadedProject = await invoke<TacticalProject>("load_project", {
        projectId
      });
      setProject(migrateProjectToCurrent(loadedProject));
      setLoadStatus(`loaded ${projectId}`);
    } catch {
      setLoadStatus("load unavailable in web mode");
    }
  };

  const refreshExportJobs = async () => {
    try {
      const jobs = await invoke<ExportJob[]>("list_export_jobs", {
        projectId: project.meta.id
      });
      setExportJobs(jobs);
      if (jobs.length > 0) {
        const latest = jobs[0];
        setExportStatus(`${latest.status} (${latest.progressPct}%)`);
      } else {
        setExportStatus("no jobs");
      }
    } catch {
      setExportJobs([]);
    }
  };

  const queueMp4Export = async () => {
    const request: Mp4ExportRequest = {
      projectId: project.meta.id,
      fps: 30,
      width: 1280,
      height: 720,
      durationMs: Math.max(totalDurationMs, 1000),
      outputFileName: `${project.meta.id}-preview.mp4`
    };

    try {
      const queuedJob = await invoke<ExportJob>("enqueue_mp4_export", { request });
      setExportStatus(`queued ${queuedJob.id}`);
      setSidePanel("export");
      await refreshExportJobs();
    } catch {
      setExportStatus("export unavailable in web mode");
    }
  };

  const cancelExportJob = async (jobId: string) => {
    try {
      const job = await invoke<ExportJob>("cancel_export_job", { jobId });
      setExportStatus(`${job.status} (${job.progressPct}%)`);
      await refreshExportJobs();
    } catch {
      setExportStatus("cancel unavailable in web mode");
    }
  };

  const retryExportJob = async (jobId: string) => {
    try {
      const job = await invoke<ExportJob>("retry_export_job", { jobId });
      setExportStatus(`queued ${job.id}`);
      await refreshExportJobs();
    } catch {
      setExportStatus("retry unavailable in web mode");
    }
  };

  const setCourtType = (courtType: "full" | "half") => {
    setProject({
      ...project,
      meta: {
        ...project.meta,
        courtType,
        schemaVersion: project.meta.schemaVersion || CURRENT_SCHEMA_VERSION,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const createNewProject = () => {
    const sceneId = createId("scene");
    const keyframeId = createId("kf");
    const nextProject: TacticalProject = {
      ...defaultProject,
      meta: {
        ...defaultProject.meta,
        id: createId("project"),
        name: "New Tactical Board",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      scenes: [
        {
          id: sceneId,
          projectId: "",
          name: "Scene 1",
          orderIndex: 0,
          durationMs: 8000
        }
      ],
      keyframes: [
        {
          id: keyframeId,
          sceneId,
          timestampMs: 0,
          drawableState: {}
        }
      ]
    };
    nextProject.scenes[0].projectId = nextProject.meta.id;
    setProject(nextProject);
    setPlaybackMs(0);
    clearSelection();
    setPersistStatus("not saved");
    setLoadStatus(`created ${nextProject.meta.id}`);
  };

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timerId = window.setInterval(() => {
      advancePlaybackMs(60, totalDurationMs);
    }, 60);

    return () => {
      window.clearInterval(timerId);
    };
  }, [advancePlaybackMs, isPlaying, totalDurationMs]);

  useEffect(() => {
    if (activeTool !== "select") {
      setIsPlaying(false);
    }
  }, [activeTool]);

  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      await Promise.all([checkHealth(), initDatabase(), refreshProjects(), refreshExportJobs()]);
      if (isCancelled) {
        return;
      }
    };
    void run();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      try {
        const jobs = await invoke<ExportJob[]>("list_export_jobs", {
          projectId: project.meta.id
        });
        if (!isCancelled) {
          setExportJobs(jobs);
          if (jobs.length > 0) {
            const latest = jobs[0];
            setExportStatus(`${latest.status} (${latest.progressPct}%)`);
          }
        }
      } catch {
        if (!isCancelled) {
          setExportJobs([]);
        }
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [project.meta.id]);

  useEffect(() => {
    const onResize = () => setViewportMode(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setViewportMode]);

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

      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        toggleDevDrawer();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        setInteractionCancelToken((token) => token + 1);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selection.ids.length > 0) {
        event.preventDefault();
        applyCommand(
          {
            type: "removeDrawables",
            ids: selection.ids
          },
          {
            label: "delete selection",
            selectionIds: []
          }
        );
        clearSelection();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selection.ids.length > 0) {
        event.preventDefault();
        const duplicates = selectedDrawables.map((drawable) => duplicateDrawable(drawable));
        applyCommand(
          {
            type: "addDrawables",
            drawables: duplicates
          },
          {
            label: "duplicate selection",
            selectionIds: duplicates.map((drawable) => drawable.id)
          }
        );
        setSelection(duplicates.map((drawable) => drawable.id));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyCommand, clearSelection, redo, selection.ids, selectedDrawables, setSelection, toggleDevDrawer, undo]);

  if (shellVersion === "legacy") {
    return (
      <LegacyShell
        project={project}
        playbackMs={playbackMs}
        totalDurationMs={totalDurationMs}
        timelineIssues={timelineIssues}
        health={health}
        dbStatus={dbStatus}
        persistStatus={persistStatus}
        loadStatus={loadStatus}
        exportStatus={exportStatus}
        exportJobs={exportJobs}
        isPlaying={isPlaying}
        onSetPlaybackMs={setPlaybackMs}
        onPlayToggle={() => setIsPlaying((value) => !value)}
        onResetPlayback={() => {
          setIsPlaying(false);
          setPlaybackMs(0);
        }}
        onCheckHealth={checkHealth}
        onInitDatabase={initDatabase}
        onSaveProject={saveProjectToLocal}
        onLoadProject={() => loadProjectFromLocal(project.meta.id)}
        onQueueExport={queueMp4Export}
        onRefreshExports={refreshExportJobs}
        onSetCourtType={setCourtType}
      />
    );
  }

  return (
    <AppFrame
      viewportMode={viewportMode}
      topBar={
        <TopCommandBar
          project={project}
          exportStatus={exportStatus}
          persistStatus={persistStatus}
          projectRows={projectRowsForUi}
          onNewProject={createNewProject}
          onSaveProject={saveProjectToLocal}
          onLoadProject={loadProjectFromLocal}
          onQueueExport={queueMp4Export}
          onSetCourtType={setCourtType}
        />
      }
      leftRail={
        <LeftRail
          activeSidePanel={activeSidePanel}
          onSelectPanel={setSidePanel}
          onToggleDevDrawer={toggleDevDrawer}
        />
      }
      rightRail={
        <RightRail
          activeSidePanel={activeSidePanel}
          activeTool={activeTool}
          selectedCount={selection.ids.length}
          selectedSummary={selectedDrawables.map((drawable) => `${drawable.type} · ${drawable.label ?? drawable.id}`)}
          project={project}
          projectRows={projectRowsForUi}
          exportJobs={exportJobs}
          loadStatus={loadStatus}
          onSelectPanel={setSidePanel}
          onLoadProject={loadProjectFromLocal}
          onQueueExport={queueMp4Export}
          onRefreshExports={refreshExportJobs}
          onCancelExport={cancelExportJob}
          onRetryExport={retryExportJob}
        />
      }
      bottomDock={
        <BottomDock
          activeTool={activeTool}
          bottomTab={bottomTab}
          playbackMs={playbackMs}
          totalDurationMs={totalDurationMs}
          keyframes={timelineKeyframes}
          activeKeyframeId={activeKeyframeId}
          selectedCount={selection.ids.length}
          isPlaying={isPlaying}
          canUndo={canUndo}
          canRedo={canRedo}
          onSelectTool={(tool) => {
            setBottomTab(tool === "select" ? bottomTab : "edit");
            setActiveTool(tool);
          }}
          onSetBottomTab={setBottomTab}
          onSetPlaybackMs={setPlaybackMs}
          onJumpToKeyframe={setPlaybackMs}
          onPlayToggle={() => setIsPlaying((value) => !value)}
          onResetPlayback={() => {
            setIsPlaying(false);
            setPlaybackMs(0);
          }}
          onUndo={undo}
          onRedo={redo}
        />
      }
      devDrawer={
        <DevDrawer
          isOpen={devDrawer.open}
          health={health}
          dbStatus={dbStatus}
          persistStatus={persistStatus}
          loadStatus={loadStatus}
          exportStatus={exportStatus}
          exportJobs={exportJobs}
          shellVersion={shellVersion}
          onCheckHealth={checkHealth}
          onInitDatabase={initDatabase}
          onSetShellVersion={setShellVersion}
          onClose={toggleDevDrawer}
        />
      }
    >
      <section className="stage-shell">
        <div className="stage-shell__header">
          <div>
            <p className="eyebrow">Tactical Board</p>
            <h2>{sampledState.activeSceneName || "No active scene"}</h2>
          </div>
          <div className="button-inline-row">
            <span className="status-pill">{selection.ids.length} selected</span>
            <span className="status-pill">{project.meta.courtType ?? "full"} court</span>
          </div>
        </div>

        <TacticalCanvas
          project={project}
          playbackMs={playbackMs}
          activeTool={activeTool}
          selectedIds={selection.ids}
          interactionCancelToken={interactionCancelToken}
          onSelectIds={setSelection}
          onCommand={applyCommand}
          onAutoPause={() => setIsPlaying(false)}
        />

        <div className="stage-shell__footer">
          <div className="stage-shell__meta-grid">
            <article className="meta-card">
              <h3>Selection</h3>
              <p>{selection.ids.length === 0 ? "No object selected" : `${selection.ids.length} selected`}</p>
            </article>
            <article className="meta-card">
              <h3>Timeline</h3>
              <p>
                {Math.round(playbackMs)}ms of {Math.round(totalDurationMs)}ms
              </p>
            </article>
            <article className="meta-card">
              <h3>Export</h3>
              <p>{exportStatus}</p>
            </article>
          </div>

          {timelineIssues.length > 0 ? (
            <ul className="warning-list">
              {timelineIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </AppFrame>
  );
}

function duplicateDrawable(drawable: Drawable): Drawable {
  return {
    ...drawable,
    id: createId(drawable.type),
    x: drawable.x + 12,
    y: drawable.y + 12,
    x2: drawable.x2 !== undefined ? drawable.x2 + 12 : drawable.x2,
    y2: drawable.y2 !== undefined ? drawable.y2 + 12 : drawable.y2,
    style: { ...drawable.style }
  };
}
