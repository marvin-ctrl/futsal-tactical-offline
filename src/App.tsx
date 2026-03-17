import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DashboardView } from "./components/home/DashboardView";
import { LibraryView } from "./components/library/LibraryView";
import { PresentationView } from "./components/presentation/PresentationView";
import { TacticalCanvas } from "./components/TacticalCanvas";
import { AppFrame } from "./components/layout/AppFrame";
import { BottomDock } from "./components/layout/BottomDock";
import { DeletePlayDialog } from "./components/layout/DeletePlayDialog";
import { DevDrawer } from "./components/layout/DevDrawer";
import { ProjectDialog } from "./components/layout/ProjectDialog";
import { RightRail } from "./components/layout/RightRail";
import { TopCommandBar } from "./components/layout/TopCommandBar";
import { LegacyShell } from "./components/shell/LegacyShell";
import { defaultProject } from "./lib/defaultProject";
import { cacheProjectThumbnail, readProjectThumbnail, removeProjectThumbnail } from "./lib/projectThumbnail";
import { cloneDrawableState, createId, CURRENT_SCHEMA_VERSION, migrateProjectToCurrent } from "./lib/projectSchema";
import { createProjectFromTemplate, PLAY_TEMPLATES } from "./lib/projectTemplates";
import { sampleTimelineAt, timelineSanityIssues } from "./lib/timeline";
import { getCourtTypeLabel, getDrawableTypeLabel } from "./lib/uiLabels";
import { useEditorState } from "./state/useEditorState";
import { useUiState } from "./state/useUiState";
import type { LibraryFilters } from "./components/library/LibraryFiltersBar";
import type { CourtType, Drawable, ExportJob, Mp4ExportRequest, ProjectMeta, ProjectRow, TacticalProject } from "./types/domain";
import type { AppView } from "./types/ui";

const PROJECT_FALLBACK_ROW = (project: TacticalProject): ProjectRow => ({
  id: project.meta.id,
  name: project.meta.name,
  description: project.meta.description,
  category: project.meta.category,
  restartType: project.meta.restartType,
  system: project.meta.system,
  ageBand: project.meta.ageBand,
  tags: project.meta.tags,
  sceneCount: project.scenes.length,
  updatedAt: project.meta.updatedAt
});

type ProjectDialogMode = "manage" | "rename" | "saveAs";
type PresentationReturnView = Exclude<AppView, "presentation">;

const INITIAL_LIBRARY_FILTERS: LibraryFilters = {
  search: "",
  category: "",
  restartType: "",
  system: "",
  ageBand: ""
};

function cloneProjectAsNewCopy(project: TacticalProject, nextName: string): TacticalProject {
  const nextProjectId = createId("project");
  const clonedAt = new Date().toISOString();
  const sceneIdMap = new Map(project.scenes.map((scene) => [scene.id, createId("scene")]));

  return {
    ...project,
    meta: {
      ...project.meta,
      id: nextProjectId,
      name: nextName,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: clonedAt,
      updatedAt: clonedAt
    },
    scenes: project.scenes.map((scene) => ({
      ...scene,
      id: sceneIdMap.get(scene.id) ?? createId("scene"),
      projectId: nextProjectId
    })),
    keyframes: project.keyframes.map((keyframe) => ({
      ...keyframe,
      id: createId("kf"),
      sceneId: sceneIdMap.get(keyframe.sceneId) ?? keyframe.sceneId,
      drawableState: cloneDrawableState(keyframe.drawableState)
    }))
  };
}

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
    appView,
    activeTool,
    activeSidePanel,
    bottomTab,
    devDrawer,
    viewportMode,
    shellVersion,
    setAppView,
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [interactionCancelToken, setInteractionCancelToken] = useState(0);
  const [exportPreset, setExportPreset] = useState("720p30");
  const [sceneNote, setSceneNote] = useState("");
  const [projectDialogMode, setProjectDialogMode] = useState<ProjectDialogMode | null>(null);
  const [libraryFilters, setLibraryFilters] = useState<LibraryFilters>(INITIAL_LIBRARY_FILTERS);
  const [thumbnailById, setThumbnailById] = useState<Record<string, string | null>>({});
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [presentationStartMs, setPresentationStartMs] = useState(0);
  const [presentationReturnView, setPresentationReturnView] = useState<PresentationReturnView>("editor");

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
  const filteredProjectRows = useMemo(() => {
    const search = libraryFilters.search.trim().toLowerCase();
    return projectRowsForUi.filter((row) => {
      if (libraryFilters.category && row.category !== libraryFilters.category) {
        return false;
      }
      if (libraryFilters.restartType && row.restartType !== libraryFilters.restartType) {
        return false;
      }
      if (libraryFilters.system && row.system !== libraryFilters.system) {
        return false;
      }
      if (libraryFilters.ageBand && row.ageBand !== libraryFilters.ageBand) {
        return false;
      }
      if (!search) {
        return true;
      }

      const haystack = [
        row.name,
        row.description ?? "",
        row.category,
        row.restartType,
        row.system ?? "",
        row.ageBand ?? "",
        row.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [libraryFilters, projectRowsForUi]);
  const recentProjectRows = useMemo(() => projectRowsForUi.slice(0, 6), [projectRowsForUi]);
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

  const updateThumbnailCache = (nextProject: TacticalProject) => {
    const thumbnail = cacheProjectThumbnail(nextProject);
    setThumbnailById((current) => ({
      ...current,
      [nextProject.meta.id]: thumbnail
    }));
  };

  const saveProjectToLocal = async () => {
    try {
      updateThumbnailCache(project);
      const result = await invoke<string>("save_project", { project });
      setPersistStatus(result);
      resetHistory();
      await refreshProjects();
    } catch {
      setPersistStatus("save unavailable in web mode");
    }
  };

  const loadProjectFromLocal = async (
    projectId = project.meta.id,
    options: {
      targetView?: "editor" | "presentation";
      returnView?: PresentationReturnView;
      presentationStartMs?: number;
    } = {}
  ) => {
    try {
      const loadedProject = await invoke<TacticalProject>("load_project", {
        projectId
      });
      const migrated = migrateProjectToCurrent(loadedProject);
      setProject(migrated);
      updateThumbnailCache(migrated);
      setLoadStatus(`loaded ${projectId}`);
      if (options.targetView === "presentation") {
        setPresentationStartMs(options.presentationStartMs ?? 0);
        setPresentationReturnView(options.returnView ?? "dashboard");
        setAppView("presentation");
      } else {
        setAppView("editor");
      }
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
    const preset = {
      "720p30": { fps: 30, width: 1280, height: 720 },
      "1080p30": { fps: 30, width: 1920, height: 1080 },
      "1080p60": { fps: 60, width: 1920, height: 1080 }
    }[exportPreset] ?? { fps: 30 as const, width: 1280, height: 720 };
    const request: Mp4ExportRequest = {
      projectId: project.meta.id,
      fps: preset.fps as 30 | 60,
      width: preset.width,
      height: preset.height,
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

  const persistSceneNote = (value: string) => {
    setSceneNote(value);
    const noteKey = `scene.note.${project.meta.id}.${sampledState.activeSceneId ?? "none"}`;
    window.localStorage.setItem(noteKey, value);
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

  const setCourtType = (courtType: CourtType) => {
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
        name: "New Play",
        description: "",
        category: "attacking pattern",
        restartType: "none",
        system: undefined,
        ageBand: undefined,
        tags: [],
        sourceTemplateId: "blank-board",
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
    resetHistory();
    updateThumbnailCache(nextProject);
    setPersistStatus("not saved");
    setLoadStatus(`created ${nextProject.meta.id}`);
    setAppView("editor");
  };

  const createPlayFromTemplate = (templateId: string) => {
    const nextProject = createProjectFromTemplate(templateId);
    setProject(nextProject);
    setPlaybackMs(0);
    clearSelection();
    resetHistory();
    updateThumbnailCache(nextProject);
    setPersistStatus("not saved");
    setLoadStatus(`created ${nextProject.meta.id}`);
    setAppView("editor");
  };

  const presentCurrentPlay = () => {
    setIsPlaying(false);
    setPresentationStartMs(playbackMs);
    setPresentationReturnView("editor");
    setAppView("presentation");
  };

  const renameProject = (nextName: string) => {
    if (!nextName || nextName === project.meta.name) {
      return;
    }
    setProject({
      ...project,
      meta: {
        ...project.meta,
        name: nextName,
        updatedAt: new Date().toISOString()
      }
    });
    setPersistStatus("renamed locally");
    setProjectDialogMode(null);
  };

  const updateProjectMeta = (changes: Partial<ProjectMeta>) => {
    setProject({
      ...project,
      meta: {
        ...project.meta,
        ...changes,
        updatedAt: new Date().toISOString()
      }
    });
    setPersistStatus("metadata updated locally");
  };

  const saveProjectAs = async (nextName: string) => {
    if (!nextName) {
      return;
    }

    const nextProject = cloneProjectAsNewCopy(project, nextName);
    setProject(nextProject);
    updateThumbnailCache(nextProject);
    setPersistStatus("save as pending");
    setLoadStatus(`branched ${nextProject.meta.id}`);
    setProjectDialogMode(null);

    try {
      const result = await invoke<string>("save_project", { project: nextProject });
      setPersistStatus(result);
      await refreshProjects();
    } catch {
      setPersistStatus("save as unavailable in web mode");
    }
  };

  const duplicateProjectFromLibrary = async (projectId: string) => {
    try {
      const loadedProject = await invoke<TacticalProject>("load_project", { projectId });
      const sourceProject = migrateProjectToCurrent(loadedProject);
      const duplicatedProject = cloneProjectAsNewCopy(sourceProject, `${sourceProject.meta.name} Copy`);
      updateThumbnailCache(duplicatedProject);
      await invoke<string>("save_project", { project: duplicatedProject });
      setPersistStatus(`duplicated ${sourceProject.meta.name}`);
      await refreshProjects();
    } catch (error) {
      setPersistStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const requestDeleteProjectFromLibrary = (projectId: string) => {
    const row = projectRowsForUi.find((candidate) => candidate.id === projectId);
    if (!row) {
      return;
    }
    setDeleteTarget(row);
  };

  const deleteProjectFromLibrary = async () => {
    if (!deleteTarget) {
      return;
    }

    const projectId = deleteTarget.id;
    try {
      await invoke<string>("delete_project", { projectId });
      removeProjectThumbnail(projectId);
      setThumbnailById((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      await refreshProjects();
      setPersistStatus(`deleted ${deleteTarget.name}`);
    } catch (error) {
      setPersistStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteTarget(null);
    }
  };

  const closeProjectDialog = () => setProjectDialogMode(null);

  const openProjectManager = () => setProjectDialogMode("manage");

  const createProjectFromDialog = () => {
    createNewProject();
    setProjectDialogMode(null);
  };

  const loadProjectFromDialog = async (projectId: string) => {
    await loadProjectFromLocal(projectId);
    setProjectDialogMode(null);
  };

  const presentProjectFromLibrary = async (projectId: string, returnView: PresentationReturnView) => {
    setIsPlaying(false);
    await loadProjectFromLocal(projectId, {
      targetView: "presentation",
      returnView,
      presentationStartMs: 0
    });
  };

  const updateSelectedDrawables = (updates: Array<{ id: string; changes: Partial<Drawable> }>, label: string) => {
    if (updates.length === 0) {
      return;
    }
    applyCommand(
      {
        type: "updateDrawables",
        updates
      },
      {
        label,
        selectionIds: selection.ids
      }
    );
  };

  const updateSelectionLabel = (label: string) => {
    updateSelectedDrawables(
      selectedDrawables.map((drawable) => ({
        id: drawable.id,
        changes: { label }
      })),
      "update label"
    );
  };

  const updateSelectionStyle = (changes: { fill?: string; stroke?: string; opacity?: number; dashed?: boolean }) => {
    updateSelectedDrawables(
      selectedDrawables.map((drawable) => ({
        id: drawable.id,
        changes: {
          style: {
            ...drawable.style,
            ...changes
          }
        }
      })),
      "update style"
    );
  };

  const toggleSelectionLocked = () => {
    updateSelectedDrawables(
      selectedDrawables.map((drawable) => ({
        id: drawable.id,
        changes: { locked: !drawable.locked }
      })),
      "toggle lock"
    );
  };

  const toggleSelectionHidden = () => {
    updateSelectedDrawables(
      selectedDrawables.map((drawable) => ({
        id: drawable.id,
        changes: { hidden: !drawable.hidden }
      })),
      "toggle visibility"
    );
  };

  const stepToKeyframe = (direction: -1 | 1) => {
    const ordered = timelineKeyframes.map((keyframe) => keyframe.playbackMs);
    if (ordered.length === 0) {
      return;
    }
    const next = direction > 0
      ? ordered.find((value) => value > playbackMs) ?? ordered[ordered.length - 1]
      : [...ordered].reverse().find((value) => value < playbackMs) ?? ordered[0];
    setPlaybackMs(next);
  };

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timerId = window.setInterval(() => {
      advancePlaybackMs(Math.round(60 * playbackRate), totalDurationMs);
    }, 60);

    return () => {
      window.clearInterval(timerId);
    };
  }, [advancePlaybackMs, isPlaying, playbackRate, totalDurationMs]);

  useEffect(() => {
    const noteKey = `scene.note.${project.meta.id}.${sampledState.activeSceneId ?? "none"}`;
    setSceneNote(window.localStorage.getItem(noteKey) ?? "");
  }, [project.meta.id, sampledState.activeSceneId]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateThumbnails = async () => {
      const nextEntries = await Promise.all(
        projectRowsForUi.map(async (row) => {
          const cached = readProjectThumbnail(row.id);
          if (cached) {
            return [row.id, cached] as const;
          }

          if (row.id === project.meta.id) {
            return [row.id, cacheProjectThumbnail(project)] as const;
          }

          try {
            const loadedProject = await invoke<TacticalProject>("load_project", {
              projectId: row.id
            });
            const migrated = migrateProjectToCurrent(loadedProject);
            return [row.id, cacheProjectThumbnail(migrated)] as const;
          } catch {
            return [row.id, null] as const;
          }
        })
      );

      if (isCancelled) {
        return;
      }

      setThumbnailById((current) => ({
        ...current,
        ...Object.fromEntries(nextEntries)
      }));
    };

    void hydrateThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [project, projectRowsForUi]);

  useEffect(() => {
    updateThumbnailCache(project);
  }, [project.meta.id]);

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
    if (appView !== "editor") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (projectDialogMode) {
        if (event.key === "Escape") {
          event.preventDefault();
          setProjectDialogMode(null);
        }
        return;
      }

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
        duplicateSelection(selectedDrawables, applyCommand, setSelection);
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
  }, [appView, applyCommand, clearSelection, projectDialogMode, redo, selection.ids, selectedDrawables, setSelection, toggleDevDrawer, undo]);

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

  if (appView === "dashboard") {
    return (
      <>
        <DashboardView
          templates={PLAY_TEMPLATES}
          recentPlays={recentProjectRows}
          thumbnailById={thumbnailById}
          onCreateFromTemplate={createPlayFromTemplate}
          onOpenPlay={loadProjectFromLocal}
          onPresentPlay={(projectId) => void presentProjectFromLibrary(projectId, "dashboard")}
          onDuplicatePlay={duplicateProjectFromLibrary}
          onDeletePlay={requestDeleteProjectFromLibrary}
          onOpenLibrary={() => setAppView("library")}
        />
        {deleteTarget ? (
          <DeletePlayDialog play={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={deleteProjectFromLibrary} />
        ) : null}
      </>
    );
  }

  if (appView === "library") {
    return (
      <>
        <LibraryView
          plays={filteredProjectRows}
          filters={libraryFilters}
          thumbnailById={thumbnailById}
          onChangeFilters={setLibraryFilters}
          onBack={() => setAppView("dashboard")}
          onOpenPlay={loadProjectFromLocal}
          onPresentPlay={(projectId) => void presentProjectFromLibrary(projectId, "library")}
          onDuplicatePlay={duplicateProjectFromLibrary}
          onDeletePlay={requestDeleteProjectFromLibrary}
        />
        {deleteTarget ? (
          <DeletePlayDialog play={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={deleteProjectFromLibrary} />
        ) : null}
      </>
    );
  }

  if (appView === "presentation") {
    return (
      <PresentationView
        project={project}
        initialPlaybackMs={presentationStartMs}
        onExit={(nextPlaybackMs) => {
          setPlaybackMs(nextPlaybackMs);
          setIsPlaying(false);
          setAppView(presentationReturnView);
        }}
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
          exportPreset={exportPreset}
          onOpenProjectDialog={openProjectManager}
          onSaveProject={saveProjectToLocal}
          onPresentPlay={presentCurrentPlay}
          onQueueExport={queueMp4Export}
          onOpenFieldPanel={() => setSidePanel("field")}
          onOpenExportPanel={() => setSidePanel("export")}
        />
      }
      rightRail={
        <RightRail
          activeSidePanel={activeSidePanel}
          activeTool={activeTool}
          selectedCount={selection.ids.length}
          selectedDrawables={selectedDrawables}
          selectedSummary={selectedDrawables.map((drawable) => `${getDrawableTypeLabel(drawable)} · ${drawable.label ?? drawable.id}`)}
          project={project}
          exportJobs={exportJobs}
          exportPreset={exportPreset}
          sceneNote={sceneNote}
          onSelectPanel={setSidePanel}
          onSetCourtType={setCourtType}
          onSetExportPreset={setExportPreset}
          onQueueExport={queueMp4Export}
          onRefreshExports={refreshExportJobs}
          onCancelExport={cancelExportJob}
          onRetryExport={retryExportJob}
          onUpdateSelectionLabel={updateSelectionLabel}
          onUpdateSelectionStyle={updateSelectionStyle}
          onToggleSelectionLocked={toggleSelectionLocked}
          onToggleSelectionHidden={toggleSelectionHidden}
          onSetSceneNote={persistSceneNote}
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
          playbackRate={playbackRate}
          canUndo={canUndo}
          canRedo={canRedo}
          canDuplicate={selection.ids.length > 0}
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
          onDuplicate={() => duplicateSelection(selectedDrawables, applyCommand, setSelection)}
          onSetPlaybackRate={setPlaybackRate}
          onStepToKeyframe={stepToKeyframe}
          onUndo={undo}
          onRedo={redo}
        />
      }
      devDrawer={
        devDrawer.open ? (
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
        ) : null
      }
    >
      <section className="stage-shell">
        <div className="stage-shell__header">
          <div>
            <p className="eyebrow">Tactical Board</p>
            <h2>{sampledState.activeSceneName || "No active step"}</h2>
          </div>
          <div className="button-inline-row">
            <span className="status-pill">{selection.ids.length} selected</span>
            <span className="status-pill">{getCourtTypeLabel(project.meta.courtType)}</span>
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
      {projectDialogMode ? (
        <ProjectDialog
          mode={projectDialogMode}
          project={project}
          projectRows={projectRowsForUi}
          persistStatus={persistStatus}
          loadStatus={loadStatus}
          thumbnailById={thumbnailById}
          onClose={closeProjectDialog}
          onNewProject={createProjectFromDialog}
          onLoadProject={loadProjectFromDialog}
          onOpenDashboard={() => {
            closeProjectDialog();
            setAppView("dashboard");
          }}
          onOpenDiagnostics={() => {
            closeProjectDialog();
            if (!devDrawer.open) {
              toggleDevDrawer();
            }
          }}
          onStartRename={() => setProjectDialogMode("rename")}
          onStartSaveAs={() => setProjectDialogMode("saveAs")}
          onRenameProject={renameProject}
          onSaveProjectAs={saveProjectAs}
          onUpdateProjectMeta={updateProjectMeta}
        />
      ) : null}
      {deleteTarget ? (
        <DeletePlayDialog play={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={deleteProjectFromLibrary} />
      ) : null}
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

function duplicateSelection(
  selectedDrawables: Drawable[],
  applyCommand: ReturnType<typeof useEditorState.getState>["applyCommand"],
  setSelection: ReturnType<typeof useEditorState.getState>["setSelection"]
) {
  if (selectedDrawables.length === 0) {
    return;
  }

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
}
