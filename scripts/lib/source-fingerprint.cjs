const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const ROOT_MARKERS = ["package.json", "vite.config.ts", "src", "server"];
const INCLUDED_DIRS = ["src", "server/src", "server/scripts", "server/vendor/nanoid-compat", "scripts", "public"];
const INCLUDED_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-monitor.yml",
  "docs/DEVICE_QA_CHECKLIST.md",
  "docs/HUMAN_AA_REVIEW_CHECKLIST.md",
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

function comparePath(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

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

function isIncludedPath(rel) {
  if (INCLUDED_FILES.includes(rel)) return true;
  if (!INCLUDED_EXTENSIONS.has(extensionOf(rel))) return false;
  if (rel.split("/").some((part) => EXCLUDED_DIR_NAMES.has(part))) return false;
  return INCLUDED_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function walk(root, dir, files) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => comparePath(a.name, b.name));
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
  return [...new Set(files)].sort(comparePath);
}

function git(root, args, options = {}) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
}

function gitAvailable(root) {
  return git(root, ["rev-parse", "--is-inside-work-tree"]).status === 0;
}

function gitTreeClean(root) {
  const result = git(root, ["status", "--porcelain", "--untracked-files=all"]);
  return result.status === 0 && result.stdout.trim().length === 0;
}

function shouldUseGitTree(root) {
  if (!gitAvailable(root)) return false;
  if (process.env.MM_SOURCE_FINGERPRINT_MODE === "working-tree") return false;
  if (process.env.MM_SOURCE_FINGERPRINT_MODE === "git-tree") return true;
  if (process.env.RENDER) return true;
  return gitTreeClean(root);
}

function gitFingerprintFiles(root = findRepoRoot()) {
  if (!gitAvailable(root)) return [];
  const result = git(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter(isIncludedPath)
    .sort(comparePath);
}

function normalizePayload(file, raw) {
  const ext = extensionOf(file);
  return TEXT_EXTENSIONS.has(ext) ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
}

function gitBlob(root, file) {
  const result = git(root, ["show", `HEAD:${file}`], { encoding: "buffer" });
  return result.status === 0 ? result.stdout : null;
}

function hashFiles(root, files, readPayload) {
  const repoRoot = resolve(root);
  const hash = createHash("sha256");
  for (const file of files) {
    const payload = normalizePayload(file, readPayload(repoRoot, file));
    hash.update(file);
    hash.update("\0");
    hash.update(String(payload.length));
    hash.update("\0");
    hash.update(payload);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function sourceFingerprintDetailsSync(root = findRepoRoot()) {
  const repoRoot = resolve(root);
  const useGitTree = shouldUseGitTree(repoRoot);
  const files = useGitTree ? gitFingerprintFiles(repoRoot) : fingerprintFiles(repoRoot);
  const source = useGitTree ? "git-tree" : "working-tree";
  const fingerprint = hashFiles(repoRoot, files, (base, file) => {
    if (useGitTree) {
      const blob = gitBlob(base, file);
      if (blob) return blob;
    }
    return readFileSync(join(base, file));
  });
  return { fingerprint, files, source };
}

function sourceFingerprintSync(root = findRepoRoot()) {
  return sourceFingerprintDetailsSync(root).fingerprint;
}

module.exports = {
  comparePath,
  fingerprintFiles,
  findRepoRoot,
  gitFingerprintFiles,
  sourceFingerprintDetailsSync,
  sourceFingerprintSync,
  INCLUDED_DIRS,
  INCLUDED_EXTENSIONS,
  TEXT_EXTENSIONS,
};
