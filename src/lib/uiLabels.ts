import type { CourtType, Drawable } from "../types/domain";
import type { ActiveTool } from "../types/ui";

const DRIBBLE_STROKE = "#f4d35e";

export function getToolLabel(tool: ActiveTool): string {
  switch (tool) {
    case "select":
      return "Select";
    case "player":
      return "Player";
    case "goalkeeper":
      return "Goalkeeper";
    case "ball":
      return "Ball";
    case "cone":
      return "Cone";
    case "run":
    case "arrow":
      return "Run";
    case "pass":
    case "line":
      return "Pass";
    case "dribble":
      return "Dribble";
    case "zone":
      return "Zone";
    case "label":
      return "Note";
    default:
      return tool;
  }
}

export function getCourtTypeLabel(courtType?: CourtType | "half"): string {
  switch (courtType) {
    case "half":
    case "half-attacking":
      return "Attack Focus";
    case "half-defending":
      return "Defend Focus";
    case "full":
    default:
      return "Full Court";
  }
}

export function getCourtTypeLongLabel(courtType?: CourtType | "half"): string {
  switch (courtType) {
    case "half":
    case "half-attacking":
      return "Attacking Half Focus";
    case "half-defending":
      return "Defending Half Focus";
    case "full":
    default:
      return "Full Court";
  }
}

export function getDrawableTypeLabel(drawable: Drawable): string {
  switch (drawable.type) {
    case "arrow":
      if (drawable.style.stroke.toLowerCase() === DRIBBLE_STROKE) {
        return "Dribble";
      }
      return drawable.style.dashed ? "Run" : "Pass";
    case "line":
      return "Pass";
    case "label":
      return "Note";
    case "goalkeeper":
      return "Goalkeeper";
    case "player":
      return "Player";
    case "ball":
      return "Ball";
    case "cone":
      return "Cone";
    case "zone":
      return "Zone";
    default:
      return drawable.type;
  }
}
