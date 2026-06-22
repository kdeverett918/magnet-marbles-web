import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const DIST_ROOT = process.env.BUILD_INFO_DIST_ROOT || "dist";
const OUTPUT = process.env.BUILD_INFO_OUTPUT || "outputs/build-info-smoke.json";
const EXPECT_COMMIT = process.env.BUILD_INFO_EXPECT_COMMIT || gitOutput(["rev-parse", "--short=12", "HEAD"], "");
const EXPECT_BRANCH = process.env.BUILD_INFO_EXPECT_BRANCH || gitOutput(["branch", "--show-current"], "");
const EXPECT_SOURCE_FINGERPRINT = process.env.BUILD_INFO_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();

function gitOutput(args, fallback) {
  try {
    const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else files.push(path);
  }
  return files;
}

function extractString(source, key) {
  const pattern = new RegExp(`${key}\\s*:\\s*(["'\`])([^"'\`]+)\\1`);
  return source.match(pattern)?.[2] ?? "";
}

function extractDirty(source) {
  const raw = source.match(/dirty\s*:\s*(!0|!1|true|false)/)?.[1] ?? "";
  if (raw === "!0" || raw === "true") return true;
  if (raw === "!1" || raw === "false") return false;
  return null;
}

function assertBuildInfo(info, label) {
  if (!info || typeof info !== "object") throw new Error(`${label} is missing`);
  if (info.name !== "magnet-marbles-web") throw new Error(`${label} name must be magnet-marbles-web`);
  if (info.version !== "1.0.0") throw new Error(`${label} version must be 1.0.0`);
  if (EXPECT_COMMIT && EXPECT_COMMIT !== "unknown" && !String(info.commit || "").startsWith(EXPECT_COMMIT)) {
    throw new Error(`${label} commit ${info.commit || "missing"} did not match expected ${EXPECT_COMMIT}`);
  }
  if (EXPECT_BRANCH && EXPECT_BRANCH !== "unknown" && info.branch !== EXPECT_BRANCH) {
    throw new Error(`${label} branch ${info.branch || "missing"} did not match expected ${EXPECT_BRANCH}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(info.builtAt || ""))) {
    throw new Error(`${label} build time is invalid: ${info.builtAt || "missing"}`);
  }
  if (info.commit === "unknown" || info.branch === "unknown") throw new Error(`${label} must not use unknown commit or branch`);
  if (typeof info.dirty !== "boolean") throw new Error(`${label} dirty flag must be boolean`);
  if (!/^[a-f0-9]{16}$/i.test(String(info.sourceFingerprint || ""))) {
    throw new Error(`${label} source fingerprint is invalid: ${info.sourceFingerprint || "missing"}`);
  }
  if (EXPECT_SOURCE_FINGERPRINT && info.sourceFingerprint !== EXPECT_SOURCE_FINGERPRINT) {
    throw new Error(`${label} source fingerprint ${info.sourceFingerprint || "missing"} did not match expected ${EXPECT_SOURCE_FINGERPRINT}`);
  }
}

async function run() {
  const rootInfo = await stat(DIST_ROOT);
  if (!rootInfo.isDirectory()) throw new Error(`${DIST_ROOT} is not a directory`);
  const buildJsonPath = join(DIST_ROOT, "build.json");
  const buildJson = JSON.parse(await readFile(buildJsonPath, "utf8"));

  const candidates = (await walkFiles(DIST_ROOT)).filter((path) => /\.(js|html)$/i.test(path));
  const scanned = [];
  let found = null;

  for (const path of candidates) {
    const source = await readFile(path, "utf8");
    const rel = relative(DIST_ROOT, path).split("\\").join("/");
    const hasBuildName = source.includes("magnet-marbles-web");
    const hasBuildHook = source.includes("__MAGNET_MARBLES_BUILD__") || source.includes("buildCommit");
    scanned.push({ path: rel, bytes: Buffer.byteLength(source), hasBuildName, hasBuildHook });
    if (!hasBuildName) continue;

    const marker = source.indexOf("magnet-marbles-web");
    const buildSource = source.slice(Math.max(0, marker - 120), marker + 620);
    const info = {
      name: extractString(buildSource, "name"),
      version: extractString(buildSource, "version"),
      commit: extractString(buildSource, "commit"),
      branch: extractString(buildSource, "branch"),
      dirty: extractDirty(buildSource),
      builtAt: extractString(buildSource, "builtAt"),
      sourceFingerprint: extractString(buildSource, "sourceFingerprint"),
      sourceFile: rel,
    };
    if (info.name === "magnet-marbles-web" && info.commit) {
      found = info;
      break;
    }
  }

  if (!found) throw new Error("production dist bundle is missing Magnet Marbles build metadata");
  assertBuildInfo(found, "dist JS build metadata");
  assertBuildInfo(buildJson, "dist build.json metadata");
  for (const key of ["name", "version", "commit", "branch", "dirty", "builtAt", "sourceFingerprint"]) {
    if (buildJson[key] !== found[key]) throw new Error(`dist build.json ${key} does not match JS bundle metadata`);
  }
  const buildJsonStat = await stat(buildJsonPath);

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    distRoot: DIST_ROOT,
    expected: { commit: EXPECT_COMMIT, branch: EXPECT_BRANCH, sourceFingerprint: EXPECT_SOURCE_FINGERPRINT },
    build: found,
    buildJson: {
      path: "build.json",
      bytes: buildJsonStat.size,
      ...buildJson,
    },
    scanned,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
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
