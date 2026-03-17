import type { AgeBand, PlayCategory, RestartType, SystemType } from "../types/domain";

export const PLAY_CATEGORY_OPTIONS: PlayCategory[] = [
  "set piece",
  "attacking pattern",
  "defensive pattern",
  "transition"
];

export const RESTART_TYPE_OPTIONS: RestartType[] = [
  "none",
  "corner",
  "kick-in",
  "free kick",
  "goalkeeper restart"
];

export const SYSTEM_OPTIONS: SystemType[] = ["3-1", "4-0", "2-2", "1-2-1", "other"];

export const AGE_BAND_OPTIONS: AgeBand[] = ["youth", "academy", "senior", "pro"];

export const DEFAULT_PLAY_CATEGORY: PlayCategory = "attacking pattern";
export const DEFAULT_RESTART_TYPE: RestartType = "none";

export function isPlayCategory(value: string | null | undefined): value is PlayCategory {
  return PLAY_CATEGORY_OPTIONS.includes(value as PlayCategory);
}

export function isRestartType(value: string | null | undefined): value is RestartType {
  return RESTART_TYPE_OPTIONS.includes(value as RestartType);
}

export function isSystemType(value: string | null | undefined): value is SystemType {
  return SYSTEM_OPTIONS.includes(value as SystemType);
}

export function isAgeBand(value: string | null | undefined): value is AgeBand {
  return AGE_BAND_OPTIONS.includes(value as AgeBand);
}

export function formatPlayLabel(value: string): string {
  return value
    .split(" ")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function sanitizeTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}
