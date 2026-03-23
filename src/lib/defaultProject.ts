import type { TacticalProject } from "../types/domain";

const now = new Date().toISOString();

export const defaultProject: TacticalProject = {
  meta: {
    id: "project_local_seed",
    name: "Build-Up Pattern",
    description: "Sample attacking pattern for rehearsing the first progression into the middle third.",
    category: "attacking pattern",
    restartType: "none",
    system: "3-1",
    ageBand: "senior",
    tags: ["build-up", "sample"],
    sourceTemplateId: "blank-board",
    courtType: "full",
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now
  },
  scenes: [
    {
      id: "scene_1",
      projectId: "project_local_seed",
      name: "Build-Up",
      orderIndex: 0,
      durationMs: 8000
    }
  ],
  keyframes: [
    {
      id: "kf_1",
      sceneId: "scene_1",
      timestampMs: 0,
      drawableState: {
        p1: {
          id: "p1",
          type: "player",
          teamId: "home",
          x: 120,
          y: 240,
          rotation: 0,
          label: "1",
          style: {
            stroke: "#111827",
            fill: "#2d6a4f",
            strokeWidth: 2,
            opacity: 1
          }
        },
        ball1: {
          id: "ball1",
          type: "ball",
          x: 160,
          y: 230,
          rotation: 0,
          style: {
            stroke: "#111827",
            fill: "#f8fafc",
            strokeWidth: 1,
            opacity: 1
          }
        },
        runArrow: {
          id: "runArrow",
          type: "arrow",
          x: 132,
          y: 240,
          x2: 342,
          y2: 222,
          rotation: 0,
          width: 210,
          height: -18,
          style: {
            stroke: "#38bdf8",
            fill: "#38bdf8",
            strokeWidth: 3,
            opacity: 0.95,
            dashed: true
          }
        },
        zone1: {
          id: "zone1",
          type: "zone",
          x: 230,
          y: 150,
          x2: 360,
          y2: 230,
          rotation: 0,
          width: 130,
          height: 80,
          label: "Pressing Zone",
          style: {
            stroke: "#d97706",
            fill: "#f59e0b",
            strokeWidth: 2,
            opacity: 0.2
          }
        },
        label1: {
          id: "label1",
          type: "label",
          x: 86,
          y: 105,
          rotation: 0,
          label: "Diagonal Trigger",
          style: {
            stroke: "#115e59",
            fill: "#14b8a6",
            strokeWidth: 2,
            opacity: 0.9
          }
        }
      }
    },
    {
      id: "kf_2",
      sceneId: "scene_1",
      timestampMs: 8000,
      drawableState: {
        p1: {
          id: "p1",
          type: "player",
          teamId: "home",
          x: 420,
          y: 220,
          rotation: 15,
          label: "1",
          style: {
            stroke: "#111827",
            fill: "#2d6a4f",
            strokeWidth: 2,
            opacity: 1
          }
        },
        ball1: {
          id: "ball1",
          type: "ball",
          x: 440,
          y: 205,
          rotation: 0,
          style: {
            stroke: "#111827",
            fill: "#f8fafc",
            strokeWidth: 1,
            opacity: 1
          }
        },
        runArrow: {
          id: "runArrow",
          type: "arrow",
          x: 420,
          y: 220,
          x2: 560,
          y2: 320,
          rotation: 0,
          width: 140,
          height: 100,
          style: {
            stroke: "#38bdf8",
            fill: "#38bdf8",
            strokeWidth: 3,
            opacity: 0.95,
            dashed: true
          }
        },
        zone1: {
          id: "zone1",
          type: "zone",
          x: 360,
          y: 160,
          x2: 500,
          y2: 250,
          rotation: 0,
          width: 140,
          height: 90,
          label: "Final Third",
          style: {
            stroke: "#d97706",
            fill: "#f59e0b",
            strokeWidth: 2,
            opacity: 0.2
          }
        },
        label1: {
          id: "label1",
          type: "label",
          x: 422,
          y: 92,
          rotation: 0,
          label: "Finish Pattern",
          style: {
            stroke: "#115e59",
            fill: "#14b8a6",
            strokeWidth: 2,
            opacity: 0.9
          }
        }
      }
    }
  ]
};
