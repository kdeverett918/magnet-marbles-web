import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT = process.env.ASSETS_OUTPUT || "outputs/assets-smoke.json";
const MIN_SFX_BYTES = 4_000;
const FORBIDDEN_MUSIC = ["public/audio/music.mp3", "dist/audio/music.mp3"];
const EXPECTED_SFX = [
  "pickup.mp3",
  "bank.mp3",
  "hit.mp3",
  "shock-pulse.mp3",
  "magnet-burst.mp3",
  "fall.mp3",
];

async function fileReport(root, file, minBytes) {
  const path = join(root, file);
  const info = await stat(path);
  if (info.size < minBytes) throw new Error(`${path} is unexpectedly small (${info.size} bytes)`);
  return { path, bytes: info.size };
}

async function assertMissing(path) {
  try {
    await stat(path);
    throw new Error(`${path} should not exist; background music is intentionally disabled`);
  } catch (error) {
    if (error?.code === "ENOENT") return { path, missing: true };
    throw error;
  }
}

async function run() {
  const sfxRoots = ["public/audio/sfx", "dist/audio/sfx"];
  const files = [];
  for (const root of sfxRoots) {
    for (const file of EXPECTED_SFX) {
      files.push(await fileReport(root, file, MIN_SFX_BYTES));
    }
  }
  const forbidden = [];
  for (const file of FORBIDDEN_MUSIC) {
    forbidden.push(await assertMissing(file));
  }

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    minSfxBytes: MIN_SFX_BYTES,
    files,
    forbidden,
  };
  await mkdir("outputs", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  await mkdir("outputs", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify({
    pass: false,
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  console.error(error.stack || error.message || error);
  process.exit(1);
});
