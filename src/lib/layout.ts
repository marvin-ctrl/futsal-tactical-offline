import type { ViewportMode } from "../types/ui";

export function resolveViewportMode(width: number): ViewportMode {
  if (width >= 1366) {
    return "wide";
  }
  if (width >= 1280) {
    return "compact";
  }
  return "fallback";
}
