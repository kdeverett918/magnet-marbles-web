const { createHash } = require("node:crypto");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const ROOT_MARKERS = ["package.json", "vite.config.ts", "src", "server"];
const INCLUDED_DIRS = ["src", "server/src", "server/scripts", "server/vendor/nanoid-compat", "scripts", "public"];
const INCLUDED_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-monitor.yml",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "server/package.json",
  "server/package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
];
const INCLUDED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jpeg",
  ".jpg",
  ".mjs",
  ".mp3",
  ".ogg",
  ".png",
  ".svg",
  ".ts",
  ".tsx",
  ".wav",
  ".webp",
  ".webmanifest",
  ".yml",
  ".yaml",
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".webmanifest",
  ".yml",
  ".yaml",
]);
const EXCLUDED_DIR_NAMES = new Set(["dist", "node_modules", "outputs"]);

function hasMarkers(dir) {
  return ROOT_MARKERS.every((marker) => existsSync(join(dir, marker)));
}

function findRepoRoot(start = process.cwd()) {
  let current = resolve(start);
  for (;;) {
    if (hasMarkers(current)) return current;
    const parent = resolve(current, "..");
    if (parent === current) return resolve(start);
    current = parent;
  }
}

function extensionOf(path) {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash ? path.slice(dot).toLowerCase() : "";
}

function walk(root, dir, files) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const rel = relative(root, path).split("\\").join("/");
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) walk(root, path, files);
      continue;
    }
    if (INCLUDED_EXTENSIONS.has(extensionOf(rel))) files.push(rel);
  }
}

function fingerprintFiles(root = findRepoRoot()) {
  const files = [];
  for (const file of INCLUDED_FILES) {
    if (existsSync(join(root, file))) files.push(file);
  }
  for (const dir of INCLUDED_DIRS) {
    walk(root, join(root, dir), files);
  }
  return [...new Set(files)].sort();
}

function sourceFingerprintSync(root = findRepoRoot()) {
  const repoRoot = resolve(root);
  const hash = createHash("sha256");
  const files = fingerprintFiles(repoRoot);
  for (const file of files) {
    const path = join(repoRoot, file);
    const raw = readFileSync(path);
    const ext = extensionOf(file);
    const payload = TEXT_EXTENSIONS.has(ext) ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
    hash.update(file);
    hash.update("\0");
    hash.update(String(payload.length));
    hash.update("\0");
    hash.update(payload);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

module.exports = {
  fingerprintFiles,
  findRepoRoot,
  sourceFingerprintSync,
  INCLUDED_DIRS,
  INCLUDED_EXTENSIONS,
  TEXT_EXTENSIONS,
};
