import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import pngjs from "pngjs";

import { drawTacticalFrame } from "../src/lib/canvasRenderer";
import { sampleTimelineAt } from "../src/lib/timeline";
import type { TacticalProject } from "../src/types/domain";

const { PNG } = pngjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS_DIR = path.join(ROOT, "tests", "parity", "artifacts");
const FIXTURE_FILES = ["fixture-full.json", "fixture-half.json"];
const WIDTH = 960;
const HEIGHT = 540;
const RATIO_SAMPLES = [0, 0.25, 0.5, 0.75, 0.95];
const PIXELMATCH_THRESHOLD = 0.2;
const MAX_DIFF_RATIO = 0.1;

interface DiffResult {
  fixture: string;
  timestampMs: number;
  mismatchPixels: number;
  diffRatio: number;
}

function main(): void {
  prepareArtifactsDir();

  const failures: DiffResult[] = [];
  let checked = 0;

  for (const fixtureFile of FIXTURE_FILES) {
    const fixturePath = path.join(ROOT, "tests", "parity", fixtureFile);
    const fixtureProject = readFixtureProject(fixturePath);
    const timestamps = checkpointTimestamps(fixtureProject);

    for (const timestampMs of timestamps) {
      checked += 1;
      const caseName = `${path.basename(fixtureFile, ".json")}_${timestampMs}`;
      const previewPath = path.join(ARTIFACTS_DIR, `${caseName}_preview.png`);
      const exportPath = path.join(ARTIFACTS_DIR, `${caseName}_export.png`);
      const diffPath = path.join(ARTIFACTS_DIR, `${caseName}_diff.png`);

      const previewBuffer = renderPreviewPng(fixtureProject, timestampMs, WIDTH, HEIGHT);
      writeFileSync(previewPath, previewBuffer);

      renderExportFramePng(fixturePath, timestampMs, WIDTH, HEIGHT, exportPath);

      const { mismatchPixels, diffRatio } = diffPng(previewBuffer, readFileSync(exportPath), diffPath);
      if (diffRatio > MAX_DIFF_RATIO) {
        failures.push({
          fixture: fixtureFile,
          timestampMs,
          mismatchPixels,
          diffRatio
        });
      } else {
        rmSync(diffPath, { force: true });
      }
    }
  }

  if (failures.length > 0) {
    console.error("Preview-vs-export parity check failed:");
    for (const failure of failures) {
      console.error(
        `- ${failure.fixture} @ ${failure.timestampMs}ms: ${(failure.diffRatio * 100).toFixed(2)}% mismatch (${failure.mismatchPixels} px)`
      );
    }
    console.error(`Artifacts: ${ARTIFACTS_DIR}`);
    process.exit(1);
  }

  console.log(
    `Preview-vs-export parity passed for ${checked} frame checkpoints. Artifacts written to ${ARTIFACTS_DIR}.`
  );
}

function prepareArtifactsDir(): void {
  rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function readFixtureProject(fixturePath: string): TacticalProject {
  const content = readFileSync(fixturePath, "utf-8");
  return JSON.parse(content) as TacticalProject;
}

function checkpointTimestamps(project: TacticalProject): number[] {
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  const timestamps = RATIO_SAMPLES.map((ratio) => Math.round(totalDuration * ratio));
  return [...new Set(timestamps)].sort((a, b) => a - b);
}

function renderPreviewPng(
  project: TacticalProject,
  timestampMs: number,
  width: number,
  height: number
): Buffer {
  const sampled = sampleTimelineAt(project, timestampMs);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  drawTacticalFrame(context as unknown as CanvasRenderingContext2D, {
    width,
    height,
    courtType: project.meta.courtType ?? "full",
    drawables: sampled.drawables
  });

  return canvas.toBuffer("image/png");
}

function renderExportFramePng(
  fixturePath: string,
  timestampMs: number,
  width: number,
  height: number,
  outputPath: string
): void {
  const args = [
    "run",
    "--quiet",
    "--manifest-path",
    path.join(ROOT, "src-tauri", "Cargo.toml"),
    "--bin",
    "render_frame_snapshot",
    "--",
    fixturePath,
    String(width),
    String(height),
    String(timestampMs),
    outputPath
  ];

  try {
    execFileSync("cargo", args, {
      cwd: ROOT,
      stdio: "pipe"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to render backend frame using cargo. Ensure Rust is installed and run command manually: cargo ${args.join(" ")}\n${message}`
    );
  }
}

function diffPng(
  previewPngBuffer: Buffer,
  exportPngBuffer: Buffer,
  diffPath: string
): { mismatchPixels: number; diffRatio: number } {
  const previewPng = PNG.sync.read(previewPngBuffer);
  const exportPng = PNG.sync.read(exportPngBuffer);

  if (previewPng.width !== exportPng.width || previewPng.height !== exportPng.height) {
    throw new Error(
      `PNG dimensions differ (preview ${previewPng.width}x${previewPng.height}, export ${exportPng.width}x${exportPng.height})`
    );
  }

  const diffPng = new PNG({ width: previewPng.width, height: previewPng.height });
  const mismatchPixels = pixelmatch(
    previewPng.data,
    exportPng.data,
    diffPng.data,
    previewPng.width,
    previewPng.height,
    {
      threshold: PIXELMATCH_THRESHOLD
    }
  );

  writeFileSync(diffPath, PNG.sync.write(diffPng));

  const totalPixels = previewPng.width * previewPng.height;
  return {
    mismatchPixels,
    diffRatio: mismatchPixels / totalPixels
  };
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
