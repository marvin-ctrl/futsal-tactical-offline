import type { CourtType, Drawable, DrawableStyle, PlayCategory, RestartType, SystemType, TacticalProject } from "../types/domain";
import { createId, CURRENT_SCHEMA_VERSION } from "./projectSchema";

export interface PlayTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: PlayCategory;
  restartType: RestartType;
  system?: SystemType;
  ageBand?: "youth" | "academy" | "senior" | "pro";
  courtType: CourtType;
  tags: string[];
  buildDrawables: () => Drawable[];
}

const ATTACK_FILL = "#d62828";
const ATTACK_STROKE = "#7f1d1d";
const DEFEND_FILL = "#2563eb";
const DEFEND_STROKE = "#1d4ed8";
const BALL_FILL = "#f8fafc";
const BALL_STROKE = "#0f172a";
const ARROW_FILL = "#84e4ff";
const ARROW_STROKE = "#0f7b93";
const PASS_FILL = "#f4b942";
const PASS_STROKE = "#8a5b00";
const ZONE_FILL = "#f59e0b";
const ZONE_STROKE = "#92400e";
const LABEL_FILL = "#14b8a6";
const LABEL_STROKE = "#115e59";

const createStyle = (fill: string, stroke: string, opacity = 1, dashed = false): DrawableStyle => ({
  fill,
  stroke,
  strokeWidth: 2,
  opacity,
  dashed
});

const createPlayer = (
  label: string,
  x: number,
  y: number,
  variant: "attack" | "defend" = "attack",
  type: "player" | "goalkeeper" = "player"
): Drawable => ({
  id: createId(type),
  type,
  x,
  y,
  rotation: 0,
  label,
  style: variant === "attack" ? createStyle(ATTACK_FILL, ATTACK_STROKE) : createStyle(DEFEND_FILL, DEFEND_STROKE)
});

const createBall = (x: number, y: number): Drawable => ({
  id: createId("ball"),
  type: "ball",
  x,
  y,
  rotation: 0,
  style: createStyle(BALL_FILL, BALL_STROKE)
});

const createArrow = (
  x: number,
  y: number,
  x2: number,
  y2: number,
  mode: "move" | "pass" = "move"
): Drawable => ({
  id: createId("arrow"),
  type: "arrow",
  x,
  y,
  x2,
  y2,
  rotation: 0,
  width: x2 - x,
  height: y2 - y,
  style:
    mode === "move"
      ? createStyle(ARROW_FILL, ARROW_STROKE, 0.95, true)
      : createStyle(PASS_FILL, PASS_STROKE, 0.95, false)
});

const createZone = (label: string, x: number, y: number, width: number, height: number): Drawable => ({
  id: createId("zone"),
  type: "zone",
  x,
  y,
  x2: x + width,
  y2: y + height,
  width,
  height,
  rotation: 0,
  label,
  style: createStyle(ZONE_FILL, ZONE_STROKE, 0.22)
});

const createLabel = (label: string, x: number, y: number): Drawable => ({
  id: createId("label"),
  type: "label",
  x,
  y,
  rotation: 0,
  label,
  style: createStyle(LABEL_FILL, LABEL_STROKE, 0.95)
});

export const PLAY_TEMPLATES: PlayTemplateDefinition[] = [
  {
    id: "blank-board",
    name: "Blank Board",
    description: "Full futsal board with one starting scene and no coaching marks.",
    category: "attacking pattern",
    restartType: "none",
    system: "3-1",
    ageBand: "senior",
    courtType: "full",
    tags: ["blank"],
    buildDrawables: () => []
  },
  {
    id: "corner-routine",
    name: "Corner Routine",
    description: "Short-corner rotation with a near-post trigger and weak-side runner.",
    category: "set piece",
    restartType: "corner",
    system: "3-1",
    ageBand: "senior",
    courtType: "half-attacking",
    tags: ["corner", "rotation"],
    buildDrawables: () => [
      createPlayer("1", 930, 430),
      createPlayer("2", 780, 340),
      createPlayer("3", 840, 230),
      createPlayer("4", 690, 250),
      createPlayer("GK", 125, 250, "attack", "goalkeeper"),
      createPlayer("D1", 885, 260, "defend"),
      createPlayer("D2", 830, 170, "defend"),
      createPlayer("D3", 805, 330, "defend"),
      createBall(975, 470),
      createArrow(930, 430, 830, 330),
      createArrow(780, 340, 910, 240, "pass"),
      createZone("Far-post lane", 820, 170, 120, 120),
      createLabel("Short option then cutback", 730, 110)
    ]
  },
  {
    id: "kick-in-press-release",
    name: "Kick-In Release",
    description: "Touchline restart that frees the pivot with a third-man run.",
    category: "set piece",
    restartType: "kick-in",
    system: "4-0",
    ageBand: "senior",
    courtType: "half-attacking",
    tags: ["kick-in", "third-man"],
    buildDrawables: () => [
      createPlayer("1", 680, 470),
      createPlayer("2", 700, 320),
      createPlayer("3", 820, 210),
      createPlayer("4", 875, 335),
      createPlayer("GK", 125, 250, "attack", "goalkeeper"),
      createPlayer("D1", 780, 260, "defend"),
      createPlayer("D2", 880, 260, "defend"),
      createBall(650, 480),
      createArrow(700, 320, 810, 360),
      createArrow(680, 470, 790, 320, "pass"),
      createZone("Receive between lines", 760, 210, 120, 90),
      createLabel("Trigger the blindside cut", 710, 120)
    ]
  },
  {
    id: "free-kick-screen",
    name: "Free Kick Screen",
    description: "Central free kick with a screen to isolate the shooter lane.",
    category: "set piece",
    restartType: "free kick",
    system: "2-2",
    ageBand: "senior",
    courtType: "half-attacking",
    tags: ["free kick", "screen"],
    buildDrawables: () => [
      createPlayer("1", 715, 250),
      createPlayer("2", 800, 215),
      createPlayer("3", 820, 295),
      createPlayer("4", 905, 220),
      createPlayer("GK", 125, 250, "attack", "goalkeeper"),
      createPlayer("W1", 825, 225, "defend"),
      createPlayer("W2", 845, 250, "defend"),
      createPlayer("W3", 825, 275, "defend"),
      createBall(690, 250),
      createArrow(800, 215, 865, 215),
      createArrow(715, 250, 905, 220, "pass"),
      createLabel("Screen then shoot", 715, 135)
    ]
  },
  {
    id: "goalkeeper-breakout",
    name: "Goalkeeper Breakout",
    description: "Full-court breakout shape for progressing out of the first line.",
    category: "transition",
    restartType: "goalkeeper restart",
    system: "3-1",
    ageBand: "senior",
    courtType: "full",
    tags: ["goalkeeper restart", "build-up"],
    buildDrawables: () => [
      createPlayer("GK", 92, 250, "attack", "goalkeeper"),
      createPlayer("2", 240, 145),
      createPlayer("3", 240, 355),
      createPlayer("4", 430, 220),
      createPlayer("5", 620, 250),
      createPlayer("D1", 560, 160, "defend"),
      createPlayer("D2", 570, 330, "defend"),
      createPlayer("D3", 720, 250, "defend"),
      createBall(115, 250),
      createArrow(92, 250, 420, 220, "pass"),
      createArrow(430, 220, 620, 250),
      createZone("Split line", 350, 145, 150, 220),
      createLabel("Break pressure through the right half-space", 250, 92)
    ]
  }
];

export function getTemplateById(templateId: string | null | undefined): PlayTemplateDefinition {
  return PLAY_TEMPLATES.find((template) => template.id === templateId) ?? PLAY_TEMPLATES[0];
}

export function createProjectFromTemplate(templateId: string, nameOverride?: string): TacticalProject {
  const template = getTemplateById(templateId);
  const projectId = createId("project");
  const sceneId = createId("scene");
  const createdAt = new Date().toISOString();
  const drawables = template.buildDrawables();

  return {
    meta: {
      id: projectId,
      name: nameOverride?.trim() || template.name,
      description: template.description,
      category: template.category,
      restartType: template.restartType,
      system: template.system,
      ageBand: template.ageBand,
      tags: [...template.tags],
      sourceTemplateId: template.id,
      courtType: template.courtType,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt
    },
    scenes: [
      {
        id: sceneId,
        projectId,
        name: "Step 1",
        orderIndex: 0,
        durationMs: 8000
      }
    ],
    keyframes: [
      {
        id: createId("kf"),
        sceneId,
        timestampMs: 0,
        drawableState: Object.fromEntries(
          drawables.map((drawable) => [
            drawable.id,
            {
              ...drawable,
              style: { ...drawable.style }
            }
          ])
        )
      }
    ]
  };
}
