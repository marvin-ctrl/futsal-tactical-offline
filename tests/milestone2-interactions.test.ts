import assert from "node:assert/strict";
import test from "node:test";
import { applyCommandToDrawableState } from "../src/lib/editorCommands";
import { createAutosaveSnapshot, shouldRestoreAutosave } from "../src/lib/projectAutosave";
import { queueExportWithLatestProject } from "../src/lib/exportFlow";
import {
  buildCommittedDrawable,
  collectDrawablesInRect,
  constrainDragDelta,
  createPlacementDrawable,
  estimateLabelSize,
  hitTestDrawables,
  moveDrawableChanges,
  normalizeDrawPoint,
  toggleSelection
} from "../src/lib/editorInteractions";
import { defaultProject } from "../src/lib/defaultProject";
import { createProjectPackageFileName, parseProjectPackage } from "../src/lib/projectPackage";
import { ensureEditableKeyframe } from "../src/lib/projectSchema";
import { sampleTimelineAt } from "../src/lib/timeline";
import { useEditorState } from "../src/state/useEditorState";
import type { Drawable, TacticalProject } from "../src/types/domain";

function cloneProject(project: TacticalProject): TacticalProject {
  return JSON.parse(JSON.stringify(project)) as TacticalProject;
}

function resetEditorState(project: TacticalProject = cloneProject(defaultProject)) {
  const store = useEditorState.getState();
  store.setProject(project);
  useEditorState.getState().setPlaybackMs(0);
  useEditorState.getState().clearSelection();
}

function makeDrawable(id: string, partial: Partial<Drawable> = {}): Drawable {
  return {
    id,
    type: "player",
    x: 100,
    y: 100,
    rotation: 0,
    width: 28,
    height: 28,
    label: id,
    style: {
      stroke: "#111827",
      fill: "#2d6a4f",
      strokeWidth: 2,
      opacity: 1
    },
    ...partial
  };
}

test("ensureEditableKeyframe reuses an existing keyframe when timestamp matches", () => {
  const resolution = ensureEditableKeyframe(cloneProject(defaultProject), 0);
  assert.ok(resolution);
  assert.equal(resolution.keyframeId, "kf_1");
  assert.equal(resolution.createdKeyframe, null);
});

test("ensureEditableKeyframe creates a keyframe at the current playback time", () => {
  const resolution = ensureEditableKeyframe(cloneProject(defaultProject), 4000);
  assert.ok(resolution?.createdKeyframe);
  assert.equal(resolution.createdKeyframe?.timestampMs, 4000);
  assert.equal(resolution.project.keyframes.length, 3);
});

test("ensureEditableKeyframe seeds the created keyframe from sampled timeline state", () => {
  const project = cloneProject(defaultProject);
  const sampled = sampleTimelineAt(project, 4000);
  const resolution = ensureEditableKeyframe(project, 4000);
  assert.ok(resolution?.createdKeyframe);

  const createdPlayer = resolution.createdKeyframe?.drawableState.p1;
  assert.ok(createdPlayer);
  assert.equal(Math.round(createdPlayer.x), Math.round(sampled.drawables.find((drawable) => drawable.id === "p1")?.x ?? 0));
  assert.equal(Math.round(createdPlayer.y), Math.round(sampled.drawables.find((drawable) => drawable.id === "p1")?.y ?? 0));
});

test("applyCommandToDrawableState clones styles when adding drawables", () => {
  const drawable = makeDrawable("new-player");
  const next = applyCommandToDrawableState({}, { type: "addDrawables", drawables: [drawable] });
  next["new-player"].style.fill = "#ffffff";
  assert.equal(drawable.style.fill, "#2d6a4f");
});

test("applyCommandToDrawableState merges style updates onto existing drawables", () => {
  const state = { p1: makeDrawable("p1") };
  const next = applyCommandToDrawableState(state, {
    type: "updateDrawables",
    updates: [
      {
        id: "p1",
        changes: {
          style: {
            fill: "#ffffff",
            stroke: "#08131f",
            strokeWidth: 4,
            opacity: 0.8
          }
        }
      }
    ]
  });

  assert.equal(next.p1.style.fill, "#ffffff");
  assert.equal(next.p1.style.stroke, "#08131f");
  assert.equal(next.p1.style.strokeWidth, 4);
  assert.equal(next.p1.style.opacity, 0.8);
});

test("applyCommandToDrawableState ignores updates for locked drawables", () => {
  const state = { p1: makeDrawable("p1", { locked: true, x: 50 }) };
  const next = applyCommandToDrawableState(state, {
    type: "updateDrawables",
    updates: [{ id: "p1", changes: { x: 120 } }]
  });

  assert.equal(next.p1.x, 50);
});

test("applyCommandToDrawableState ignores removals for locked drawables", () => {
  const state = { p1: makeDrawable("p1", { locked: true }) };
  const next = applyCommandToDrawableState(state, {
    type: "removeDrawables",
    ids: ["p1"]
  });

  assert.ok(next.p1);
});

test("applyCommandToDrawableState applies batch commands in order", () => {
  const next = applyCommandToDrawableState({}, {
    type: "batch",
    label: "seed and move",
    commands: [
      { type: "addDrawables", drawables: [makeDrawable("p1")] },
      { type: "updateDrawables", updates: [{ id: "p1", changes: { x: 180 } }] }
    ]
  });

  assert.equal(next.p1.x, 180);
});

test("toggleSelection adds a drawable when it is not selected", () => {
  assert.deepEqual(toggleSelection(["p1"], "p2"), ["p1", "p2"]);
});

test("toggleSelection removes a drawable when it is already selected", () => {
  assert.deepEqual(toggleSelection(["p1", "p2"], "p2"), ["p1"]);
});

test("normalizeDrawPoint axis-locks horizontal drags", () => {
  assert.deepEqual(normalizeDrawPoint({ x: 10, y: 10 }, { x: 40, y: 12 }, true), {
    x: 40,
    y: 10
  });
});

test("normalizeDrawPoint axis-locks vertical drags", () => {
  assert.deepEqual(normalizeDrawPoint({ x: 10, y: 10 }, { x: 12, y: 40 }, true), {
    x: 10,
    y: 40
  });
});

test("constrainDragDelta clamps groups uniformly at pitch boundaries", () => {
  const drawables = [
    makeDrawable("p1", { x: 20, y: 30 }),
    makeDrawable("p2", { x: 60, y: 30 })
  ];
  const delta = constrainDragDelta(drawables, ["p1", "p2"], { x: -40, y: 0 }, { width: 120, height: 80 });

  assert.deepEqual(delta, { x: -8, y: 0 });
  const movedA = moveDrawableChanges(drawables[0], delta);
  const movedB = moveDrawableChanges(drawables[1], delta);
  assert.equal((movedB.x as number) - (movedA.x as number), 40);
});

test("moveDrawableChanges preserves line geometry with shared translation", () => {
  const line = makeDrawable("line1", {
    type: "line",
    x: 10,
    y: 20,
    x2: 50,
    y2: 60
  });
  const changes = moveDrawableChanges(line, { x: 15, y: -5 });
  assert.deepEqual(changes, { x: 25, y: 15, x2: 65, y2: 55 });
});

test("collectDrawablesInRect only returns fully enclosed drawables", () => {
  const enclosed = makeDrawable("inside", { x: 60, y: 60 });
  const partial = makeDrawable("partial", { x: 10, y: 10 });
  const ids = collectDrawablesInRect([enclosed, partial], { x: 20, y: 20 }, { x: 100, y: 100 });
  assert.deepEqual(ids, ["inside"]);
});

test("hitTestDrawables resolves to the topmost drawable after z-index sorting", () => {
  const project = cloneProject(defaultProject);
  project.keyframes[0].drawableState.zone1 = {
    ...project.keyframes[0].drawableState.zone1,
    x: 200,
    y: 120,
    x2: 280,
    y2: 180,
    zIndex: 2
  };
  project.keyframes[0].drawableState.label1 = {
    ...project.keyframes[0].drawableState.label1,
    x: 212,
    y: 132,
    label: "Overlap",
    zIndex: 12
  };

  const sampled = sampleTimelineAt(project, 0);
  const hit = hitTestDrawables(sampled.drawables, { x: 220, y: 140 });
  assert.equal(hit?.id, "label1");
});

test("createPlacementDrawable centers labels on the pointer", () => {
  const size = estimateLabelSize("Note");
  const label = createPlacementDrawable("label", { x: 200, y: 120 });
  assert.ok(label);
  assert.equal(label?.x, 200 - size.width * 0.5);
  assert.equal(label?.y, 120 - size.height * 0.5);
});

test("buildCommittedDrawable stores draw endpoints for arrows", () => {
  const arrow = buildCommittedDrawable("arrow", { x: 20, y: 30 }, { x: 80, y: 50 }, "arrow-test");
  assert.equal(arrow.x2, 80);
  assert.equal(arrow.y2, 50);
  assert.equal(arrow.width, 60);
  assert.equal(arrow.height, 20);
});

test("createProjectPackageFileName sanitizes the play name", () => {
  assert.equal(createProjectPackageFileName("Press & Pivot"), "press-pivot.futsal-play.json");
});

test("parseProjectPackage accepts the packaged project envelope", () => {
  const packageJson = JSON.stringify({
    format: "futsal-tactical-package",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    project: cloneProject(defaultProject)
  });

  const parsed = parseProjectPackage(packageJson);
  assert.equal(parsed.meta.id, defaultProject.meta.id);
  assert.equal(parsed.scenes.length, defaultProject.scenes.length);
});

test("shouldRestoreAutosave returns true when there is no saved project", () => {
  const snapshot = createAutosaveSnapshot(cloneProject(defaultProject));
  assert.equal(shouldRestoreAutosave(null, snapshot), true);
});

test("queueExportWithLatestProject persists unsaved edits before enqueueing export", async () => {
  const callOrder: string[] = [];

  const job = await queueExportWithLatestProject({
    hasUnsavedChanges: true,
    persistLatestProject: async () => {
      callOrder.push("persist");
      return true;
    },
    enqueue: async () => {
      callOrder.push("enqueue");
      return { id: "job_1" };
    }
  });

  assert.deepEqual(callOrder, ["persist", "enqueue"]);
  assert.deepEqual(job, { id: "job_1" });
});

test("queueExportWithLatestProject skips enqueue when persisting unsaved edits fails", async () => {
  const callOrder: string[] = [];

  const job = await queueExportWithLatestProject({
    hasUnsavedChanges: true,
    persistLatestProject: async () => {
      callOrder.push("persist");
      return false;
    },
    enqueue: async () => {
      callOrder.push("enqueue");
      return { id: "job_2" };
    }
  });

  assert.deepEqual(callOrder, ["persist"]);
  assert.equal(job, null);
});

test("queueExportWithLatestProject does not persist when editor state is already saved", async () => {
  const callOrder: string[] = [];

  const job = await queueExportWithLatestProject({
    hasUnsavedChanges: false,
    persistLatestProject: async () => {
      callOrder.push("persist");
      return true;
    },
    enqueue: async () => {
      callOrder.push("enqueue");
      return { id: "job_3" };
    }
  });

  assert.deepEqual(callOrder, ["enqueue"]);
  assert.deepEqual(job, { id: "job_3" });
});

test("shouldRestoreAutosave prefers the newer autosaved project", () => {
  const savedProject = cloneProject(defaultProject);
  savedProject.meta.updatedAt = "2026-01-01T00:00:00.000Z";

  const autosavedProject = cloneProject(defaultProject);
  autosavedProject.meta.updatedAt = "2026-01-02T00:00:00.000Z";
  const snapshot = createAutosaveSnapshot(autosavedProject);

  assert.equal(shouldRestoreAutosave(savedProject, snapshot), true);
});

test("useEditorState auto-creates a keyframe on first edit at an empty timestamp", () => {
  resetEditorState();
  useEditorState.getState().setPlaybackMs(4000);
  useEditorState.getState().applyCommand(
    {
      type: "updateDrawables",
      updates: [{ id: "p1", changes: { x: 300 } }]
    },
    {
      label: "move p1",
      selectionIds: ["p1"]
    }
  );

  const state = useEditorState.getState();
  const inserted = state.project.keyframes.find((keyframe) => keyframe.timestampMs === 4000);
  assert.ok(inserted);
  assert.equal(inserted?.drawableState.p1.x, 300);
  assert.equal(state.selection.ids[0], "p1");
});

test("useEditorState undo and redo restore project shape and selection", () => {
  resetEditorState();
  useEditorState.getState().setPlaybackMs(4000);
  useEditorState.getState().applyCommand(
    {
      type: "removeDrawables",
      ids: ["p1"]
    },
    {
      label: "remove p1",
      selectionIds: []
    }
  );

  useEditorState.getState().undo();
  let state = useEditorState.getState();
  assert.equal(state.project.keyframes.length, 2);
  assert.deepEqual(state.selection.ids, []);
  assert.ok(state.project.keyframes[0].drawableState.p1);

  useEditorState.getState().redo();
  state = useEditorState.getState();
  assert.equal(state.project.keyframes.length, 3);
  assert.deepEqual(state.selection.ids, []);
  assert.equal(state.project.keyframes.find((keyframe) => keyframe.timestampMs === 4000)?.drawableState.p1, undefined);
});
