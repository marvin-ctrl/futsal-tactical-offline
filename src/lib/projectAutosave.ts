import type { TacticalProject } from "../types/domain";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { normalizeProject } from "./projectSchema";

const AUTOSAVE_LATEST_KEY = "project.autosave.latest";

interface ProjectAutosaveSnapshot {
  savedAt: string;
  project: TacticalProject;
}

function autosaveProjectKey(projectId: string): string {
  return `project.autosave.${projectId}`;
}

function readStorageValue(key: string): string | null {
  return readBrowserStorage(key);
}

function writeStorageValue(key: string, value: string): void {
  writeBrowserStorage(key, value);
}

function removeStorageValue(key: string): void {
  removeBrowserStorage(key);
}

function parseAutosaveSnapshot(raw: string | null): ProjectAutosaveSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProjectAutosaveSnapshot>;
    if (!parsed || typeof parsed.savedAt !== "string" || typeof parsed.project !== "object" || !parsed.project) {
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      project: normalizeProject(parsed.project as TacticalProject)
    };
  } catch {
    return null;
  }
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createAutosaveSnapshot(project: TacticalProject): ProjectAutosaveSnapshot {
  return {
    savedAt: new Date().toISOString(),
    project: normalizeProject(project)
  };
}

export function saveAutosaveSnapshot(project: TacticalProject): ProjectAutosaveSnapshot {
  const snapshot = createAutosaveSnapshot(project);
  writeStorageValue(autosaveProjectKey(project.meta.id), JSON.stringify(snapshot));
  writeStorageValue(AUTOSAVE_LATEST_KEY, project.meta.id);
  return snapshot;
}

export function readAutosaveSnapshot(projectId: string): ProjectAutosaveSnapshot | null {
  return parseAutosaveSnapshot(readStorageValue(autosaveProjectKey(projectId)));
}

export function readLatestAutosaveSnapshot(): ProjectAutosaveSnapshot | null {
  const latestProjectId = readStorageValue(AUTOSAVE_LATEST_KEY);
  if (!latestProjectId) {
    return null;
  }

  return readAutosaveSnapshot(latestProjectId);
}

export function clearAutosaveSnapshot(projectId: string): void {
  removeStorageValue(autosaveProjectKey(projectId));
  if (readStorageValue(AUTOSAVE_LATEST_KEY) === projectId) {
    removeStorageValue(AUTOSAVE_LATEST_KEY);
  }
}

export function shouldRestoreAutosave(
  savedProject: TacticalProject | null,
  snapshot: ProjectAutosaveSnapshot
): boolean {
  if (!savedProject) {
    return true;
  }

  return (
    toTimestamp(snapshot.project.meta.updatedAt) > toTimestamp(savedProject.meta.updatedAt) ||
    toTimestamp(snapshot.savedAt) > toTimestamp(savedProject.meta.updatedAt)
  );
}
