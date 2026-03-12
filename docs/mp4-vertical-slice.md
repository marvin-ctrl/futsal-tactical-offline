# MP4 Vertical Slice Plan (Sprint 0)

## Objective
Prove end-to-end offline MP4 export from timeline data with deterministic frame timing.

## Flow
1. Load saved project timeline from local SQLite.
2. Render each frame to local PNG image sequence in app export cache.
3. Invoke local FFmpeg with fixed fps and resolution against `frame_%06d.png`.
4. Write MP4 to app export directory (or chosen file name).
5. Record job status and timings in `export_job` table.

## MVP constraints
- Presets: 720p and 1080p.
- FPS: 30 or 60 only.
- No audio track.
- Max duration cap for initial release (for example 90 seconds).

## Acceptance check
- 20-30 second tactical animation exports successfully as MP4.
- Frame order and timing match in-app playback at sampled timestamps.
- Export status transitions are persisted correctly on restart.
- Export jobs can be polled in-app without manual app restart.
- Renderer snapshot/unit tests cover frame count, court preset differences, and interpolation changes.
