# Futsal Tactical Offline - MVP Spec (Sprint 0)

## 1. Product goal
Build an offline-first desktop futsal tactics app that allows coaches to design, animate, and export tactical sequences including MP4 without internet connectivity.

## 2. MVP in scope
- Futsal board editing (full and half court presets).
- Draggable tactical objects: players, goalkeeper, ball, cones, zones.
- Drawing tools: arrows, lines, labels, highlights.
- Scene timeline with keyframes and interpolation.
- Playback controls (play/pause/scrub/loop/speed).
- Local save/load with autosave.
- Local export: PNG, PDF, MP4.
- Read-only project package sharing via export/import files.

## 3. Out of scope (post-MVP)
- Realtime collaboration.
- Team RBAC and org administration.
- Cloud-first sync and multi-user comments.
- Audio tracks, transitions, or advanced video effects.

## 4. Core constraints
- Must function 100% offline after install.
- No backend dependency for tactical editing or exports.
- Deterministic timeline rendering between preview and MP4 output.

## 5. Technical architecture
- UI shell: React + TypeScript.
- Desktop runtime: Tauri.
- Local persistence: SQLite + filesystem.
- Video export: local FFmpeg execution.
- Shared timeline schema to drive both runtime preview and export renderer.

## 6. Non-functional requirements
- Board interaction latency: p95 < 50 ms on target desktop devices.
- Playback smoothness: 60 fps desktop target, 30 fps minimum on tablet-class hardware.
- MP4 export reliability: >= 98% successful jobs.
- MP4 export speed: p95 < 120s for a 60s animation at 1080p (no audio).
- Crash-free session target: >= 99.5% during beta.

## 7. Sprint 0 acceptance criteria
- A seeded project loads from local data.
- Database initializes in local app data dir.
- Timeline seed model supports at least two keyframes in one scene.
- Vertical slice MP4 pipeline documented and local queued export command executes FFmpeg.
- Test plan drafted for offline save/load and export jobs.

## 8. Stage gates
- Gate A (end Sprint 0): timeline JSON -> renderer -> FFmpeg proof for a short clip.
- Gate B (end core build): deterministic visual parity between playback and exported MP4.
- Gate C (pre-beta): offline reliability under app restarts and filesystem path changes.

## 9. Risks and mitigations
- Rendering drift between preview/export:
  Use shared interpolation logic and snapshot tests at fixed timestamps.
- Long export times on low-end machines:
  Limit MVP presets (720p/1080p), fixed fps, duration caps.
- Data corruption in abrupt shutdowns:
  Use transactional writes and autosave checkpoints.
