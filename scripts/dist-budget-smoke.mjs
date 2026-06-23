import { gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const DIST_ROOT = process.env.DIST_BUDGET_ROOT || "dist";
const OUTPUT = process.env.DIST_BUDGET_OUTPUT || "outputs/dist-budget-smoke.json";

const LIMITS = {
  maxTotalBytes: Number(process.env.DIST_BUDGET_MAX_TOTAL_BYTES || 3_500_000),
  maxTotalJsBytes: Number(process.env.DIST_BUDGET_MAX_TOTAL_JS_BYTES || 1_850_000),
  maxTotalJsGzipBytes: Number(process.env.DIST_BUDGET_MAX_TOTAL_JS_GZIP_BYTES || 575_000),
  maxSingleJsBytes: Number(process.env.DIST_BUDGET_MAX_SINGLE_JS_BYTES || 1_150_000),
  maxTotalCssBytes: Number(process.env.DIST_BUDGET_MAX_TOTAL_CSS_BYTES || 80_000),
  maxAudioBytes: Number(process.env.DIST_BUDGET_MAX_AUDIO_BYTES || 180_000),
  maxImageBytes: Number(process.env.DIST_BUDGET_MAX_IMAGE_BYTES || 1_100_000),
};

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".svg", ".webmanifest"]);
const MUSIC_FILE_PATTERN = /(?:^|\/)audio\/music\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const DEV_MARKERS = [
  "/@vite/client",
  "vite/client",
  "import.meta.hot",
  "localhost:5173",
  "127.0.0.1:5173",
  "sourceMappingURL=",
];

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function kindFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".js") return "js";
  if (ext === ".css") return "css";
  if ([".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext)) return "image";
  if ([".html", ".webmanifest", ".json"].includes(ext)) return "document";
  return "other";
}

function assertLimit(value, max, label) {
  if (value > max) throw new Error(`${label} budget exceeded: ${value} > ${max}`);
}

async function inspectText(path, rel) {
  const text = await readFile(path, "utf8");
  const marker = DEV_MARKERS.find((item) => text.includes(item));
  if (marker) throw new Error(`${rel} contains launch-blocking dev marker '${marker}'`);
}

async function run() {
  const files = await collectFiles(DIST_ROOT);
  const summary = {
    totalBytes: 0,
    totalJsBytes: 0,
    totalJsGzipBytes: 0,
    totalCssBytes: 0,
    totalAudioBytes: 0,
    totalImageBytes: 0,
    largestFile: null,
  };
  const assets = [];

  for (const path of files) {
    const info = await stat(path);
    const rel = relative(DIST_ROOT, path).replace(/\\/g, "/");
    const ext = extname(path).toLowerCase();
    const kind = kindFor(path);
    const asset = { path: rel, kind, bytes: info.size };

    if (rel.endsWith(".map")) throw new Error(`${rel} should not ship in production dist`);
    if (MUSIC_FILE_PATTERN.test(rel)) {
      throw new Error(`${rel} must not ship; background music is disabled`);
    }

    summary.totalBytes += info.size;
    if (!summary.largestFile || info.size > summary.largestFile.bytes) summary.largestFile = asset;

    if (kind === "js") {
      const bytes = await readFile(path);
      asset.gzipBytes = gzipSync(bytes).byteLength;
      summary.totalJsBytes += info.size;
      summary.totalJsGzipBytes += asset.gzipBytes;
      assertLimit(info.size, LIMITS.maxSingleJsBytes, `${rel} raw JS`);
    } else if (kind === "css") {
      summary.totalCssBytes += info.size;
    } else if (kind === "audio") {
      summary.totalAudioBytes += info.size;
    } else if (kind === "image") {
      summary.totalImageBytes += info.size;
    }

    if (TEXT_EXTENSIONS.has(ext)) await inspectText(path, rel);
    assets.push(asset);
  }

  assertLimit(summary.totalBytes, LIMITS.maxTotalBytes, "total dist");
  assertLimit(summary.totalJsBytes, LIMITS.maxTotalJsBytes, "total JS");
  assertLimit(summary.totalJsGzipBytes, LIMITS.maxTotalJsGzipBytes, "total gzipped JS");
  assertLimit(summary.totalCssBytes, LIMITS.maxTotalCssBytes, "total CSS");
  assertLimit(summary.totalAudioBytes, LIMITS.maxAudioBytes, "total audio");
  assertLimit(summary.totalImageBytes, LIMITS.maxImageBytes, "total image");

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    distRoot: DIST_ROOT,
    limits: LIMITS,
    summary,
    assets: assets.sort((a, b) => b.bytes - a.bytes),
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
