import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.SOURCE_FINGERPRINT_OUTPUT || "outputs/source-fingerprint-smoke.json";
const {
  fingerprintFiles,
  sourceFingerprintDetailsSync,
  sourceFingerprintSync,
  INCLUDED_EXTENSIONS,
  TEXT_EXTENSIONS,
} = fingerprintModule;

const requiredFiles = [
  "scripts/lib/source-fingerprint.cjs",
  "scripts/ip-safety-smoke.mjs",
  "scripts/clean-exit-smoke.mjs",
  "vite.config.ts",
  "server/scripts/build.mjs",
  "server/src/index.ts",
  "src/vite-env.d.ts",
  "src/game/buildInfo.ts",
  "src/game/serviceWorker.ts",
  "public/service-worker.js",
  "public/audio/sfx/pickup.mp3",
  "public/audio/sfx/bank.mp3",
  "public/icons/icon-512.png",
  "public/icons/icon-maskable-512.png",
  "public/social-card.png",
  "public/manifest.webmanifest",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const files = fingerprintFiles();
  const fileSet = new Set(files);
  const details = sourceFingerprintDetailsSync();
  const first = sourceFingerprintSync();
  const second = sourceFingerprintSync();
  const missing = requiredFiles.filter((file) => !fileSet.has(file));
  assert(missing.length === 0, `source fingerprint is missing required files: ${missing.join(", ")}`);
  assert(first === second, "source fingerprint is not deterministic across repeated runs");
  assert(/^[a-f0-9]{16}$/.test(first), `source fingerprint has unexpected format: ${first}`);
  assert(INCLUDED_EXTENSIONS.has(".png") && INCLUDED_EXTENSIONS.has(".mp3"), "source fingerprint does not include shipped binary asset extensions");
  assert(!TEXT_EXTENSIONS.has(".png") && !TEXT_EXTENSIONS.has(".mp3"), "binary asset extensions must not be treated as line-normalized text");

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    sourceFingerprint: first,
    sourceFingerprintSource: details.source,
    fileCount: files.length,
    hashedFileCount: details.files.length,
    requiredFiles,
    binaryExtensions: [".png", ".mp3"],
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    error: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  } catch {
    /* ignore report write failures */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
