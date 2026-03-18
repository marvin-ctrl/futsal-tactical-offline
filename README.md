# Futsal Tactical Offline

Offline-first futsal tactics board for desktop.

The app is built around a proper futsal court, scene-based play building, timeline animation, presentation mode, and local export. It is designed to work without cloud dependencies.

## Current product state

This is an active alpha / early beta desktop app.

It is already suitable for internal use and pilot testing. It is not yet commercial-release ready.

## What it does

- Desktop offline app with Tauri
- Full futsal tactical board with corrected `Full`, `Attack Focus`, and `Defend Focus` views
- Dashboard and play library
- Template-based play creation
- Play metadata:
  - title
  - description
  - category
  - restart type
  - system
  - age band
  - tags
- Scene-based workflow
- Timeline animation
- Presentation mode
- Drawing and editing tools:
  - player
  - goalkeeper
  - ball
  - cone
  - run
  - pass
  - dribble
  - zone
  - label
- Multi-select, drag, duplicate, delete, undo, redo
- Autosave and restore
- Local play import/export with `.futsal-play.json`
- Export queue with MP4, PNG, and PDF support
- Preview/export renderer parity checks

## Stack

- React
- TypeScript
- Vite
- Tauri
- Rust
- SQLite
- FFmpeg

## Project structure

- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/src`
  Frontend app, editor UI, renderer mapping, and state.
- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/src-tauri`
  Desktop runtime, SQLite persistence, renderer, and export workers.
- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/tests`
  Interaction and parity checks.
- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/docs`
  Supporting specs and notes.

## Prerequisites

- Node.js 18+
- npm
- Rust toolchain
- FFmpeg available on `PATH`

## Development

Install dependencies:

```bash
npm install
```

Run the web shell:

```bash
npm run dev
```

Run the desktop app in development:

```bash
npm run tauri:dev
```

Build the frontend:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri:build
```

## Checks

Interaction tests:

```bash
npm run test:interactions
```

Preview vs export parity:

```bash
npm run parity:check
```

Rust renderer tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml renderer
```

Release verification baseline:

```bash
npm run release:verify
```

## Automation

- CI workflow: `/Users/marvineakins/Downloads/Projects/Futsal Tactical/.github/workflows/ci.yml`
- Release workflow: `/Users/marvineakins/Downloads/Projects/Futsal Tactical/.github/workflows/release.yml`
- Release runbook: `/Users/marvineakins/Downloads/Projects/Futsal Tactical/docs/release-process.md`

## Release artifacts

The macOS build outputs are generated under:

- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/src-tauri/target/release/bundle/macos/Futsal Tactical Offline.app`
- `/Users/marvineakins/Downloads/Projects/Futsal Tactical/src-tauri/target/release/bundle/dmg/Futsal Tactical Offline_0.1.0_aarch64.dmg`

## Known gaps before commercialization

- release signing / notarization
- updater strategy
- broader desktop E2E regression coverage
- autosave hardening into app-managed storage
- stronger static export QA
- licensing / billing / activation
- crash reporting and support tooling

## Repository

[https://github.com/marvin-ctrl/futsal-tactical-offline](https://github.com/marvin-ctrl/futsal-tactical-offline)
