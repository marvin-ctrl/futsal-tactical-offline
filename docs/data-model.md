# Offline Data Model (Initial)

## 1. Domain entities
- Project: container for tactical work.
- Scene: ordered tactical segment in a project.
- Keyframe: timestamped state snapshot per scene.
- Drawable state: serialized object graph (players, ball, annotations, etc.).
- Export job: local export queue record for PNG/PDF/MP4.

## 2. Canonical timeline structure (TypeScript)
```ts
interface TacticalProject {
  meta: ProjectMeta;
  scenes: Scene[];
  keyframes: Keyframe[];
}

interface ProjectMeta {
  id: string;
  name: string;
  courtType?: "full" | "half";
  createdAt: string;
  updatedAt: string;
}

interface Keyframe {
  id: string;
  sceneId: string;
  timestampMs: number;
  drawableState: Record<string, Drawable>;
}

interface Drawable {
  id: string;
  type: string;
  x: number;
  y: number;
  x2?: number; // optional explicit line end point
  y2?: number; // optional explicit line end point
  width?: number;
  height?: number;
}
```

## 3. SQLite mapping
- `project`: root metadata.
- `project.court_type`: tactical board preset (`full` or `half` futsal).
- `scene`: ordered scene definitions.
- `keyframe`: per-scene snapshots in `drawable_state_json`.
- `export_job`: queue state and output path metadata.

## 4. Serialization rules
- `drawable_state_json` stores full object snapshots to guarantee deterministic exports.
- IDs are UUID-compatible strings.
- Timestamps are integer milliseconds.
- Times in DB are UTC text (`CURRENT_TIMESTAMP`).

## 5. Export job states
- `queued`: accepted, waiting for worker.
- `running`: FFmpeg pipeline in progress.
- `succeeded`: output available at `output_path`.
- `failed`: terminal with `error_message`.

## 6. Planned migration path
- `0001_init.sql`: base tables + indexes.
- `0002_assets.sql` (planned): local media assets and project package metadata.
- `0003_undo_log.sql` (planned): optional journal for large history timelines.
