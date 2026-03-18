# Release Process

## Current state

The repository now has:

- CI verification on every push to `main` and on pull requests
- tag-driven macOS release packaging on GitHub Actions
- repeatable local release verification via `npm run release:verify`

What is **not** solved yet:

- Apple code signing
- Apple notarization
- auto-update distribution

That means the GitHub release workflow currently produces working macOS artifacts, but they are not yet fully commercial-distribution ready.

## Local release verification

Run the baseline release checks before tagging:

```bash
npm ci
npm run release:verify
```

If you need fresh desktop artifacts locally:

```bash
npm run tauri:build
```

## GitHub CI

Workflow:

- `.github/workflows/ci.yml`

What it does:

- installs Node, Rust, and FFmpeg on macOS
- runs `npm ci`
- runs `npm run release:verify`
- uploads parity artifacts

## GitHub release packaging

Workflow:

- `.github/workflows/release.yml`

Trigger:

- push a tag like `v0.1.1`

What it does:

- runs the same release verification baseline
- builds the Tauri macOS bundle
- uploads:
  - `.dmg`
  - compressed `.app` bundle

## Suggested release steps

1. Make sure `main` is green locally.
2. Push your final commit to `main`.
3. Create and push a release tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

4. Wait for the `Release` workflow to finish.
5. Download and smoke-test the `.dmg` and `.app.tar.gz` artifacts.

## Commercialization gap

Before public commercial distribution on macOS, add:

1. signing identity configuration in Tauri/macOS build
2. notarization credentials in GitHub Actions secrets
3. notarization/stapling steps in the release workflow
4. final installer/distribution QA on a clean macOS machine

## Future secrets to plan for

When notarization is implemented, expect to add secrets such as:

- Apple Developer certificate material
- certificate password
- Apple notarization credentials
- Apple Team ID

Do not add placeholder secrets to the workflow until the signing approach is finalized.
