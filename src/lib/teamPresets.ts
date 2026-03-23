import type { Drawable, DrawableStyle, TeamId } from "../types/domain";
import { createId } from "./projectSchema";

export type FormationPreset = "3-1" | "4-0" | "1-1-2" | "1-2-1";

type TeamDrawableType = "player" | "goalkeeper";

type FormationNode = {
  label: string;
  x: number;
  y: number;
  type?: TeamDrawableType;
};

const TEAM_PALETTE: Record<TeamId, { fill: string; stroke: string }> = {
  home: {
    fill: "#d62828",
    stroke: "#7f1d1d"
  },
  away: {
    fill: "#2563eb",
    stroke: "#1d4ed8"
  }
};

const FORMATIONS: Record<TeamId, Record<FormationPreset, FormationNode[]>> = {
  home: {
    "3-1": [
      { label: "GK", x: 96, y: 250, type: "goalkeeper" },
      { label: "1", x: 238, y: 250 },
      { label: "2", x: 320, y: 156 },
      { label: "3", x: 320, y: 344 },
      { label: "4", x: 560, y: 250 }
    ],
    "4-0": [
      { label: "GK", x: 96, y: 250, type: "goalkeeper" },
      { label: "1", x: 236, y: 160 },
      { label: "2", x: 236, y: 340 },
      { label: "3", x: 412, y: 194 },
      { label: "4", x: 412, y: 306 }
    ],
    "1-1-2": [
      { label: "GK", x: 96, y: 250, type: "goalkeeper" },
      { label: "1", x: 276, y: 250 },
      { label: "2", x: 360, y: 250 },
      { label: "3", x: 438, y: 176 },
      { label: "4", x: 438, y: 324 }
    ],
    "1-2-1": [
      { label: "GK", x: 96, y: 250, type: "goalkeeper" },
      { label: "1", x: 248, y: 250 },
      { label: "2", x: 356, y: 176 },
      { label: "3", x: 356, y: 324 },
      { label: "4", x: 468, y: 250 }
    ]
  },
  away: {
    "3-1": [
      { label: "GK", x: 904, y: 250, type: "goalkeeper" },
      { label: "1", x: 762, y: 250 },
      { label: "2", x: 680, y: 156 },
      { label: "3", x: 680, y: 344 },
      { label: "4", x: 440, y: 250 }
    ],
    "4-0": [
      { label: "GK", x: 904, y: 250, type: "goalkeeper" },
      { label: "1", x: 764, y: 160 },
      { label: "2", x: 764, y: 340 },
      { label: "3", x: 588, y: 194 },
      { label: "4", x: 588, y: 306 }
    ],
    "1-1-2": [
      { label: "GK", x: 904, y: 250, type: "goalkeeper" },
      { label: "1", x: 724, y: 250 },
      { label: "2", x: 818, y: 250 },
      { label: "3", x: 902, y: 176 },
      { label: "4", x: 902, y: 324 }
    ],
    "1-2-1": [
      { label: "GK", x: 904, y: 250, type: "goalkeeper" },
      { label: "1", x: 742, y: 250 },
      { label: "2", x: 828, y: 176 },
      { label: "3", x: 828, y: 324 },
      { label: "4", x: 916, y: 250 }
    ]
  }
};

export const HOME_FORMATION_PRESETS: FormationPreset[] = ["3-1", "4-0"];
export const AWAY_FORMATION_PRESETS: FormationPreset[] = ["1-1-2", "1-2-1"];

export function isTeamDrawable(drawable: Drawable): drawable is Drawable & { type: TeamDrawableType } {
  return drawable.type === "player" || drawable.type === "goalkeeper";
}

export function buildTeamStyle(teamId: TeamId): DrawableStyle {
  const palette = TEAM_PALETTE[teamId];
  return {
    stroke: palette.stroke,
    fill: palette.fill,
    strokeWidth: 2,
    opacity: 1
  };
}

export function assignDrawableToTeam(drawable: Drawable, teamId: TeamId): Drawable {
  if (!isTeamDrawable(drawable)) {
    return drawable;
  }

  return {
    ...drawable,
    teamId,
    style: buildTeamStyle(teamId)
  };
}

export function createTeamPlayer(
  label: string,
  x: number,
  y: number,
  teamId: TeamId,
  type: TeamDrawableType = "player"
): Drawable {
  return {
    id: createId(type),
    type,
    teamId,
    x,
    y,
    rotation: 0,
    label,
    style: buildTeamStyle(teamId)
  };
}

export function buildFormationDrawables(teamId: TeamId, formation: FormationPreset): Drawable[] {
  return FORMATIONS[teamId][formation].map((node) =>
    createTeamPlayer(node.label, node.x, node.y, teamId, node.type ?? "player")
  );
}
