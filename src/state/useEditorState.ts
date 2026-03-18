import { create } from "zustand";
import { defaultProject } from "../lib/defaultProject";
import { applyCommandToDrawableState } from "../lib/editorCommands";
import {
  ensureEditableKeyframe,
  migrateProjectToCurrent,
  normalizeProject,
  replaceKeyframeDrawableState
} from "../lib/projectSchema";
import { sampleTimelineAt } from "../lib/timeline";
import type { TacticalProject, UUID } from "../types/domain";
import type { EditorCommand, SelectionState } from "../types/ui";

interface HistoryEntry {
  label: string;
  before: TacticalProject;
  after: TacticalProject;
  selectionBefore: UUID[];
  selectionAfter: UUID[];
}

interface ApplyCommandOptions {
  label?: string;
  selectionIds?: UUID[];
}

interface ApplyProjectUpdateOptions {
  label?: string;
  selectionIds?: UUID[];
}

interface EditorState {
  project: TacticalProject;
  playbackMs: number;
  selection: SelectionState;
  activeKeyframeId: UUID | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  setProject: (project: TacticalProject) => void;
  resetHistory: () => void;
  setPlaybackMs: (value: number) => void;
  advancePlaybackMs: (delta: number, loopAtMs: number) => void;
  setSelection: (ids: UUID[]) => void;
  clearSelection: () => void;
  setActiveKeyframe: (id: UUID | null) => void;
  applyProjectUpdate: (project: TacticalProject, options?: ApplyProjectUpdateOptions) => void;
  applyCommand: (command: EditorCommand, options?: ApplyCommandOptions) => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 200;
const initialProject = migrateProjectToCurrent(defaultProject);

function cloneProject(project: TacticalProject): TacticalProject {
  return normalizeProject(project, project.meta.schemaVersion);
}

function resolveActiveKeyframeId(project: TacticalProject, playbackMs: number): UUID | null {
  const sampled = sampleTimelineAt(project, playbackMs);
  if (!sampled.activeSceneId) {
    return null;
  }

  return (
    project.keyframes.find(
      (keyframe) =>
        keyframe.sceneId === sampled.activeSceneId &&
        Math.round(keyframe.timestampMs) === Math.round(sampled.localTimestampMs)
    )?.id ?? null
  );
}

export const useEditorState = create<EditorState>((set, get) => ({
  project: initialProject,
  playbackMs: 0,
  selection: {
    ids: []
  },
  activeKeyframeId: resolveActiveKeyframeId(initialProject, 0),
  undoStack: [],
  redoStack: [],
  setProject: (project) => {
    const nextProject = migrateProjectToCurrent(project);
    set({
      project: nextProject,
      selection: { ids: [] },
      activeKeyframeId: resolveActiveKeyframeId(nextProject, get().playbackMs),
      undoStack: [],
      redoStack: []
    });
  },
  resetHistory: () => set({ undoStack: [], redoStack: [] }),
  setPlaybackMs: (value) =>
    set((state) => {
      const playbackMs = Math.max(0, value);
      return {
        playbackMs,
        activeKeyframeId: resolveActiveKeyframeId(state.project, playbackMs)
      };
    }),
  advancePlaybackMs: (delta, loopAtMs) =>
    set((state) => {
      if (loopAtMs <= 0) {
        return {
          playbackMs: 0,
          activeKeyframeId: resolveActiveKeyframeId(state.project, 0)
        };
      }
      const next = state.playbackMs + delta;
      const playbackMs = next > loopAtMs ? 0 : Math.max(0, next);
      return {
        playbackMs,
        activeKeyframeId: resolveActiveKeyframeId(state.project, playbackMs)
      };
    }),
  setSelection: (ids) => set({ selection: { ids: [...new Set(ids)] } }),
  clearSelection: () => set({ selection: { ids: [] } }),
  setActiveKeyframe: (id) => set({ activeKeyframeId: id }),
  applyProjectUpdate: (project, options) => {
    const state = get();
    const nextProject = migrateProjectToCurrent(project);
    const entry: HistoryEntry = {
      label: options?.label ?? "update project",
      before: cloneProject(state.project),
      after: cloneProject(nextProject),
      selectionBefore: [...state.selection.ids],
      selectionAfter: [...(options?.selectionIds ?? state.selection.ids)]
    };

    set((current) => ({
      project: nextProject,
      selection: {
        ids: options?.selectionIds ?? current.selection.ids
      },
      activeKeyframeId: resolveActiveKeyframeId(nextProject, current.playbackMs),
      undoStack: [...current.undoStack, entry].slice(-HISTORY_LIMIT),
      redoStack: []
    }));
  },
  applyCommand: (command, options) => {
    const state = get();
    const editableResolution = ensureEditableKeyframe(state.project, state.playbackMs);
    if (!editableResolution) {
      return;
    }

    const workingProject = editableResolution.project;
    const keyframe = workingProject.keyframes.find(
      (candidate) => candidate.id === editableResolution.keyframeId
    );
    if (!keyframe) {
      return;
    }

    const beforeProject = cloneProject(state.project);
    const nextDrawableState = applyCommandToDrawableState(keyframe.drawableState, command);
    const nextProject = replaceKeyframeDrawableState(
      workingProject,
      editableResolution.keyframeId,
      nextDrawableState
    );

    const label =
      options?.label ?? (command.type === "batch" ? command.label : command.type.replace(/([A-Z])/g, " $1"));
    const entry: HistoryEntry = {
      label,
      before: beforeProject,
      after: cloneProject(nextProject),
      selectionBefore: [...state.selection.ids],
      selectionAfter: [...(options?.selectionIds ?? state.selection.ids)]
    };

    set((current) => ({
      project: nextProject,
      selection: {
        ids: options?.selectionIds ?? current.selection.ids
      },
      activeKeyframeId: editableResolution.keyframeId,
      undoStack: [...current.undoStack, entry].slice(-HISTORY_LIMIT),
      redoStack: []
    }));
  },
  undo: () =>
    set((state) => {
      const entry = state.undoStack[state.undoStack.length - 1];
      if (!entry) {
        return state;
      }

      return {
        project: cloneProject(entry.before),
        selection: {
          ids: [...entry.selectionBefore]
        },
        activeKeyframeId: resolveActiveKeyframeId(entry.before, state.playbackMs),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, entry]
      };
    }),
  redo: () =>
    set((state) => {
      const entry = state.redoStack[state.redoStack.length - 1];
      if (!entry) {
        return state;
      }

      return {
        project: cloneProject(entry.after),
        selection: {
          ids: [...entry.selectionAfter]
        },
        activeKeyframeId: resolveActiveKeyframeId(entry.after, state.playbackMs),
        undoStack: [...state.undoStack, entry].slice(-HISTORY_LIMIT),
        redoStack: state.redoStack.slice(0, -1)
      };
    })
}));
