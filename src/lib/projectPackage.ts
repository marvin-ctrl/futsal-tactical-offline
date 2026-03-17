import type { TacticalProject } from "../types/domain";
import { normalizeProject } from "./projectSchema";

const PROJECT_PACKAGE_FORMAT = "futsal-tactical-package";
const PROJECT_PACKAGE_VERSION = 1;

const PROJECT_PACKAGE_FILE_EXTENSION = ".futsal-play.json";

interface TacticalProjectPackage {
  format: typeof PROJECT_PACKAGE_FORMAT;
  version: typeof PROJECT_PACKAGE_VERSION;
  exportedAt: string;
  project: TacticalProject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTacticalProject(value: unknown): value is TacticalProject {
  if (!isRecord(value)) {
    return false;
  }

  const meta = value.meta;
  return (
    isRecord(meta) &&
    typeof meta.id === "string" &&
    typeof meta.name === "string" &&
    Array.isArray(value.scenes) &&
    Array.isArray(value.keyframes)
  );
}

function createProjectPackage(project: TacticalProject): TacticalProjectPackage {
  return {
    format: PROJECT_PACKAGE_FORMAT,
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    project: normalizeProject(project)
  };
}

export function createProjectPackageFileName(name: string): string {
  const baseName =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "futsal-play";

  return `${baseName}${PROJECT_PACKAGE_FILE_EXTENSION}`;
}

export function downloadProjectPackage(project: TacticalProject): void {
  const content = JSON.stringify(createProjectPackage(project), null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createProjectPackageFileName(project.meta.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function parseProjectPackage(content: string): TacticalProject {
  const parsed = JSON.parse(content) as unknown;
  const candidate =
    isRecord(parsed) && parsed.format === PROJECT_PACKAGE_FORMAT ? parsed.project : parsed;

  if (!isTacticalProject(candidate)) {
    throw new Error("Unsupported project package file");
  }

  return candidate;
}
