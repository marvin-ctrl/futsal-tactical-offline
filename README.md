# Futsal Tactical Offline

Offline-first desktop application for futsal tactical board editing, timeline animation, and local MP4 export.

## Stack
- React + TypeScript + Vite
- Tauri (Rust)
- SQLite (rusqlite)
- Local FFmpeg pipeline (planned in Sprint 0/1)

## Project structure
- `src/`: frontend app shell and domain types.
- `src-tauri/`: desktop runtime and local persistence layer.
- `docs/`: Sprint 0 spec and architecture/data notes.

## Quick start
1. Install dependencies:
   `npm install`
2. Ensure local prerequisites are installed:
   - Rust toolchain (`rustup`, `cargo`, `rustc`)
   - FFmpeg on PATH
3. Run web shell:
   `npm run dev`
4. Run desktop shell:
   `npm run tauri:dev`
5. Run renderer/export unit tests (after Rust is installed):
   `cargo test --manifest-path src-tauri/Cargo.toml renderer`
6. Run preview-vs-export image parity checks:
   `npm run parity:check`

## Sprint 0 status
- [x] MVP/offline specification drafted.
- [x] Initial domain model defined.
- [x] SQLite migration scaffolded.
- [x] Tauri command bridge initialized.
- [x] Save/load project commands (SQLite).
- [x] MP4 export job lifecycle and FFmpeg worker scaffold.
- [x] Timeline frame renderer -> FFmpeg image sequence path.
- [x] Court + tactical object renderer with lines/arrows/zones/labels in export frames.
- [x] Live tactical canvas preview with timeline interpolation and court presets.
- [x] Timeline sanity checks surfaced in the app.
- [x] Canvas preview line/arc/arrow rendering tuned to match export math.
- [x] Add automated preview-vs-export image diff checks.

## Parity checks
- Command: `npm run parity:check`
- Inputs: `tests/parity/fixture-full.json`, `tests/parity/fixture-half.json`
- Output artifacts: `tests/parity/artifacts/` (`*_preview.png`, `*_export.png`, and `*_diff.png` for failing cases)
- Backend helper binary used by the check: `render_frame_snapshot` (`src-tauri/src/bin/render_frame_snapshot.rs`)
