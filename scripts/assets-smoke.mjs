import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT = process.env.ASSETS_OUTPUT || "outputs/assets-smoke.json";
const MIN_SFX_BYTES = 4_000;
const MUSIC_TOMBSTONE_MAX_BYTES = 20_000;
const MUSIC_TOMBSTONES = ["public/audio/music.mp3", "dist/audio/music.mp3"];
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

async function assertSilentTombstone(path) {
  const info = await stat(path);
  if (info.size <= 0) throw new Error(`${path} tombstone is empty`);
  if (info.size > MUSIC_TOMBSTONE_MAX_BYTES) {
    throw new Error(`${path} is ${info.size} bytes; expected a tiny silent tombstone, not background music`);
  }
  return { path, bytes: info.size, maxBytes: MUSIC_TOMBSTONE_MAX_BYTES };
}

async function run() {
  const sfxRoots = ["public/audio/sfx", "dist/audio/sfx"];
  const files = [];
  for (const root of sfxRoots) {
    for (const file of EXPECTED_SFX) {
      files.push(await fileReport(root, file, MIN_SFX_BYTES));
    }
  }
  const musicTombstones = [];
  for (const file of MUSIC_TOMBSTONES) {
    musicTombstones.push(await assertSilentTombstone(file));
  }

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    minSfxBytes: MIN_SFX_BYTES,
    musicTombstoneMaxBytes: MUSIC_TOMBSTONE_MAX_BYTES,
    files,
    musicTombstones,
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
