import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.RELEASE_STATUS_OUTPUT || "outputs/release-status.json";
const ROOT = process.cwd();
const NO_BROWSER_REPORT = process.env.RELEASE_STATUS_NO_BROWSER_REPORT || "outputs/no-browser-check.json";
const NO_BROWSER_FINGERPRINT_REPORT = process.env.RELEASE_STATUS_NO_BROWSER_FINGERPRINT_REPORT || "outputs/source-fingerprint-smoke-no-browser.json";
const RELEASE_REPORT = process.env.RELEASE_STATUS_RELEASE_REPORT || "outputs/release-readiness.json";
const EVIDENCE_TEMPLATE_REPORT = process.env.RELEASE_STATUS_EVIDENCE_TEMPLATE_REPORT || "outputs/evidence-templates/evidence-template-report.json";
const REVIEWER_HANDOFF = process.env.RELEASE_STATUS_REVIEWER_HANDOFF || "outputs/evidence-templates/reviewer-handoff.md";
const MAX_SAFE_GATE_AGE_HOURS = Number(process.env.RELEASE_STATUS_MAX_SAFE_GATE_AGE_HOURS || 24);
const REQUIRE_HOSTING_LIVE = process.env.RELEASE_STATUS_REQUIRE_HOSTING_LIVE === "1";
const currentFingerprint = fingerprintModule.sourceFingerprintSync();
const fingerprintDetails = fingerprintModule.sourceFingerprintDetailsSync();

const requiredNoBrowserSteps = [
  "web:test",
  "web:vertical-slice",
  "web:sim-soak",
  "web:sim-performance",
  "web:build",
  "web:source-fingerprint-smoke",
  "web:a11y-static-smoke",
  "web:mobile-layout-static-smoke",
  "web:browser-guard-smoke",
  "web:evidence-negative-smoke",
  "web:device-qa-smoke",
  "web:hosting-config-smoke",
  "web:human-review-smoke",
  "server:nanoid-compat-smoke",
  "online:classic-smoke",
  "online:modes-smoke",
  "online:disconnect-smoke",
  "repo:diff-check",
];

function commandOutput(command, args, fallback = "") {
  try {
    const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

function commandRawOutput(command, args, fallback = "") {
  try {
    const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout || fallback : fallback;
  } catch {
    return fallback;
  }
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readTextIfExists(path) {
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}

function ageHours(capturedAt) {
  const ms = Date.parse(capturedAt || "");
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ms) / 3_600_000;
}

function runNodeScript(label, script, env = {}) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    label,
    script,
    status: result.status,
    pass: result.status === 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    stdout: String(result.stdout || "").trim().slice(-4000),
    stderr: String(result.stderr || "").trim().slice(-4000),
  };
}

function addCheck(checks, name, pass, evidence, severity = "blocker", extra = {}) {
  checks.push({ name, pass: Boolean(pass), severity, evidence, ...extra });
}

function shortList(items, limit = 10) {
  const values = items.filter(Boolean);
  return values.length > limit ? [...values.slice(0, limit), `+${values.length - limit} more`] : values;
}

function parsePorcelainLine(line) {
  const value = line.replace(/\r$/, "");
  if (/^[ MADRCU?!][ MADRCU?!] /.test(value)) {
    return {
      status: value.slice(0, 2).trim() || "modified",
      path: value.slice(3).trim(),
    };
  }
  const fallback = value.trim().match(/^(\S+)\s+(.+)$/);
  return {
    status: fallback?.[1] || "modified",
    path: fallback?.[2] || value.trim(),
  };
}

function summarizeDirtyFiles(lines) {
  const directories = new Map();
  const states = new Map();
  for (const line of lines) {
    const { status, path } = parsePorcelainLine(line);
    const root = path.includes("/") ? path.split("/")[0] : path.includes("\\") ? path.split("\\")[0] : path;
    directories.set(root, (directories.get(root) || 0) + 1);
    states.set(status, (states.get(status) || 0) + 1);
  }
  return {
    byStatus: Object.fromEntries([...states.entries()].sort()),
    byTopLevel: Object.fromEntries([...directories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };
}

function summarizeRun(command, report) {
  return {
    command,
    status: command.status,
    elapsedMs: command.elapsedMs,
    reportFound: Boolean(report),
    pass: Boolean(report?.pass),
    blockers: report?.blockers ?? [],
    warnings: report?.warnings ?? [],
  };
}

function checkNamed(checks, name) {
  return checks.find((check) => check.name === name);
}

function pushAction(actions, value) {
  if (value && !actions.includes(value)) actions.push(value);
}

function releaseNextActions(checks) {
  const actions = [];
  const safeGate = checkNamed(checks, "safe-gate:validate:no-browser-current");
  const templates = checkNamed(checks, "evidence:templates-and-handoff-current");
  const deviceQa = checkNamed(checks, "evidence:physical-device-qa-current");
  const humanReview = checkNamed(checks, "evidence:human-aa-review-current");
  const hostingLive = checkNamed(checks, "hosting:render-live-config-checked");
  const dirtyTree = checkNamed(checks, "candidate:working-tree-clean");
  const liveVersion = checkNamed(checks, "live:version-current-and-no-music");
  const browserGate = checkNamed(checks, "browser-gate:release-verify-current");
  const liveReady = liveVersion?.pass === true;
  const reviewerHandoffReady = templates?.pass === true;

  if (!safeGate?.pass) {
    pushAction(actions, "Run npm run validate:no-browser after the final source changes so the safe gate fingerprint matches the current candidate.");
  }
  if (!hostingLive?.pass) {
    pushAction(actions, "Check live Render service config with RELEASE_STATUS_CHECK_HOSTING_LIVE=1 npm run release:status, or require it with RELEASE_STATUS_REQUIRE_HOSTING_LIVE=1.");
  }
  if (!dirtyTree?.pass) {
    pushAction(actions, "Commit and push the current candidate once the working tree is intentionally scoped.");
  }
  if (!liveReady) {
    pushAction(actions, "Deploy Render web/server and wait until live ./build.json plus /health match the current commit and source fingerprint.");
    pushAction(actions, "Run npm run live:version to confirm live build metadata and removed music assets without opening Chrome.");
    pushAction(actions, "After live:version passes, run npm run evidence:templates to regenerate reviewer-handoff.md before starting physical-device or human AA review.");
  } else if (!reviewerHandoffReady) {
    pushAction(actions, "Run npm run evidence:templates before starting device or human review so reviewers receive the current live candidate handoff.");
  }
  if (liveReady && reviewerHandoffReady) {
    if (!deviceQa?.pass) {
      pushAction(actions, "Fill outputs/device-qa-evidence.json from docs/DEVICE_QA_CHECKLIST.md, then run DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa.");
    }
    if (!humanReview?.pass) {
      pushAction(actions, "Fill outputs/human-aa-review-evidence.json from docs/HUMAN_AA_REVIEW_CHECKLIST.md, then run HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review.");
    }
  } else if (!deviceQa?.pass || !humanReview?.pass) {
    pushAction(actions, "Do not collect or submit physical-device/human AA evidence until live:version passes and reviewer-handoff.md is regenerated for the current candidate.");
  }
  if (!browserGate?.pass) {
    pushAction(actions, "Only when browser tabs are explicitly acceptable and the no-browser blockers above are clear, run MM_ALLOW_BROWSER=1 npm run release:verify.");
  }
  if (actions.length === 0) {
    pushAction(actions, "No release-status blockers remain; preserve outputs/release-status.json with the final release evidence.");
  }
  return actions;
}

async function run() {
  const checks = [];
  const branch = commandOutput("git", ["branch", "--show-current"], "unknown");
  const commit = commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
  const dirtyRawLines = commandRawOutput("git", ["status", "--porcelain", "--untracked-files=all"], "")
    .split(/\r?\n/)
    .filter(Boolean);
  const dirtyFiles = dirtyRawLines.map((line) => {
    const { status, path } = parsePorcelainLine(line);
    return `${status} ${path}`;
  });
  const dirtyScope = summarizeDirtyFiles(dirtyRawLines);

  addCheck(
    checks,
    "candidate:working-tree-clean",
    dirtyFiles.length === 0,
    dirtyFiles.length === 0 ? "Working tree is clean" : `Working tree has ${dirtyFiles.length} changed/untracked files`,
  );

  const buildJson = await readJsonIfExists("dist/build.json");
  addCheck(
    checks,
    "candidate:dist-build-current",
    buildJson?.commit === commit && buildJson?.sourceFingerprint === currentFingerprint,
    buildJson
      ? `dist/build.json commit ${buildJson.commit || "missing"}, source ${buildJson.sourceFingerprint || "missing"}; expected ${commit}/${currentFingerprint}`
      : "dist/build.json is missing; run npm run build",
  );

  const noBrowser = await readJsonIfExists(NO_BROWSER_REPORT);
  const noBrowserFingerprint = await readJsonIfExists(NO_BROWSER_FINGERPRINT_REPORT);
  const noBrowserSteps = new Set((noBrowser?.steps ?? []).map((step) => step.name));
  const missingNoBrowserSteps = requiredNoBrowserSteps.filter((step) => !noBrowserSteps.has(step));
  const failedNoBrowserSteps = (noBrowser?.steps ?? []).filter((step) => step.pass !== true).map((step) => step.name);
  const noBrowserAgeHours = ageHours(noBrowser?.capturedAt);
  addCheck(
    checks,
    "safe-gate:validate:no-browser-current",
    Boolean(noBrowser?.pass)
      && noBrowser?.browserAutomation === false
      && noBrowserAgeHours <= MAX_SAFE_GATE_AGE_HOURS
      && missingNoBrowserSteps.length === 0
      && failedNoBrowserSteps.length === 0
      && noBrowserFingerprint?.sourceFingerprint === currentFingerprint,
    noBrowser
      ? `validate:no-browser captured ${noBrowser.capturedAt}, age ${noBrowserAgeHours.toFixed(2)}h, source ${noBrowserFingerprint?.sourceFingerprint || "missing"}, current ${currentFingerprint}`
      : `${NO_BROWSER_REPORT} is missing; run npm run validate:no-browser`,
    "blocker",
    {
      missingSteps: missingNoBrowserSteps,
      failedSteps: failedNoBrowserSteps,
      noBrowserReport: NO_BROWSER_REPORT,
      noBrowserFingerprintReport: NO_BROWSER_FINGERPRINT_REPORT,
    },
  );

  const liveCommand = runNodeScript("live:version", "scripts/live-version-smoke.mjs", {
    LIVE_VERSION_OUTPUT: "outputs/release-status-live-version.json",
    LIVE_VERSION_EXPECT_COMMIT: commit,
    LIVE_VERSION_EXPECT_SOURCE_FINGERPRINT: currentFingerprint,
    LIVE_VERSION_REQUIRE_MATCH: "1",
    LIVE_VERSION_TIMEOUT_MS: process.env.RELEASE_STATUS_LIVE_TIMEOUT_MS || "45000",
  });
  const liveReport = await readJsonIfExists("outputs/release-status-live-version.json");
  addCheck(
    checks,
    "live:version-current-and-no-music",
    Boolean(liveReport?.pass),
    liveReport?.pass
      ? `Live web/server build metadata match ${commit}/${currentFingerprint}; removed background music assets are gone or tombstoned`
      : `Live version did not match the current candidate: ${shortList(liveReport?.blockers ?? [liveCommand.stderr || liveCommand.stdout || "unknown failure"]).join("; ")}`,
    "blocker",
    { result: summarizeRun(liveCommand, liveReport) },
  );

  const deviceCommand = runNodeScript("device:qa", "scripts/device-qa-smoke.mjs", {
    DEVICE_QA_OUTPUT: "outputs/release-status-device-qa.json",
    DEVICE_QA_REQUIRE_EVIDENCE: "1",
    DEVICE_QA_EXPECT_COMMIT: commit,
    DEVICE_QA_EXPECT_SOURCE_FINGERPRINT: currentFingerprint,
  });
  const deviceReport = await readJsonIfExists("outputs/release-status-device-qa.json");
  addCheck(
    checks,
    "evidence:physical-device-qa-current",
    Boolean(deviceReport?.pass),
    deviceReport?.pass
      ? "Physical-device QA evidence matches the current candidate"
      : shortList((deviceReport?.blockers ?? []).map((item) => item.message || String(item))).join("; ") || "Physical-device QA evidence is missing or invalid",
    "blocker",
    { result: summarizeRun(deviceCommand, deviceReport) },
  );

  const humanCommand = runNodeScript("human:review", "scripts/human-review-smoke.mjs", {
    HUMAN_AA_REVIEW_OUTPUT: "outputs/release-status-human-review.json",
    HUMAN_AA_REVIEW_REQUIRE_EVIDENCE: "1",
    HUMAN_AA_REVIEW_EXPECT_COMMIT: commit,
    HUMAN_AA_REVIEW_EXPECT_SOURCE_FINGERPRINT: currentFingerprint,
  });
  const humanReport = await readJsonIfExists("outputs/release-status-human-review.json");
  addCheck(
    checks,
    "evidence:human-aa-review-current",
    Boolean(humanReport?.pass),
    humanReport?.pass
      ? "Human AA review evidence matches the current candidate and ships"
      : shortList((humanReport?.blockers ?? []).map((item) => item.message || String(item))).join("; ") || "Human AA review evidence is missing or invalid",
    "blocker",
    { result: summarizeRun(humanCommand, humanReport) },
  );

  const hostingCommand = runNodeScript("hosting:smoke", "scripts/hosting-config-smoke.mjs", {
    HOSTING_OUTPUT: "outputs/release-status-hosting-config.json",
    HOSTING_REQUIRE_LIVE_CONFIG: REQUIRE_HOSTING_LIVE ? "1" : "0",
    HOSTING_CHECK_LIVE_CONFIG: process.env.RELEASE_STATUS_CHECK_HOSTING_LIVE === "1" ? "1" : "0",
  });
  const hostingReport = await readJsonIfExists("outputs/release-status-hosting-config.json");
  addCheck(
    checks,
    "hosting:render-blueprint-and-live-config",
    Boolean(hostingReport?.pass) && (!REQUIRE_HOSTING_LIVE || hostingReport?.live?.checked === true),
    hostingReport?.pass
      ? REQUIRE_HOSTING_LIVE
        ? `Render live config checked: ${hostingReport.live?.checked ? "yes" : "no"}`
        : "Render blueprint passes; live Render API config can be required with RELEASE_STATUS_REQUIRE_HOSTING_LIVE=1"
      : shortList((hostingReport?.blockers ?? []).map((item) => item.message || String(item))).join("; ") || "Render hosting config check failed",
    REQUIRE_HOSTING_LIVE ? "blocker" : "warning",
    { result: summarizeRun(hostingCommand, hostingReport) },
  );
  addCheck(
    checks,
    "hosting:render-live-config-checked",
    hostingReport?.live?.checked === true,
    hostingReport?.live?.checked === true
      ? "Render live service config was checked through the Render API"
      : "Render live service config was not checked; set RELEASE_STATUS_CHECK_HOSTING_LIVE=1 for a warning-level check or RELEASE_STATUS_REQUIRE_HOSTING_LIVE=1 for a release-blocking check",
    REQUIRE_HOSTING_LIVE ? "blocker" : "warning",
    { live: hostingReport?.live ?? null },
  );

  const templateReport = await readJsonIfExists(EVIDENCE_TEMPLATE_REPORT);
  const reviewerHandoff = await readTextIfExists(REVIEWER_HANDOFF);
  const templateKinds = new Set((templateReport?.templates ?? []).map((item) => item.kind));
  const templateFresh = templateReport?.candidate?.sourceFingerprint === currentFingerprint
    && templateReport?.candidate?.commit === commit
    && templateKinds.has("device-qa")
    && templateKinds.has("human-aa-review")
    && templateKinds.has("reviewer-handoff")
    && reviewerHandoff.includes(currentFingerprint)
    && reviewerHandoff.includes(commit)
    && reviewerHandoff.includes("Required Captures")
    && reviewerHandoff.includes("Review Start Gate")
    && reviewerHandoff.includes("Do not begin phone QA or human AA review")
    && reviewerHandoff.includes("live:version-current-and-no-music");
  addCheck(
    checks,
    "evidence:templates-and-handoff-current",
    templateFresh,
    templateFresh
      ? `Evidence templates and reviewer handoff match ${commit}/${currentFingerprint}`
      : `Evidence templates or reviewer handoff are missing/stale; run npm run evidence:templates for ${commit}/${currentFingerprint}`,
    "warning",
    {
      templateReport: EVIDENCE_TEMPLATE_REPORT,
      reviewerHandoff: REVIEWER_HANDOFF,
      foundKinds: [...templateKinds],
      templateFingerprint: templateReport?.candidate?.sourceFingerprint ?? null,
    },
  );

  const releaseReport = await readJsonIfExists(RELEASE_REPORT);
  const releaseAgeHours = ageHours(releaseReport?.capturedAt);
  const liveSteps = releaseReport?.live?.steps ?? [];
  const liveStepFailures = liveSteps.filter((step) => step.pass !== true).map((step) => step.name);
  addCheck(
    checks,
    "browser-gate:release-verify-current",
    Boolean(releaseReport?.pass)
      && releaseAgeHours <= MAX_SAFE_GATE_AGE_HOURS
      && (releaseReport?.live?.cdp?.started === true || releaseReport?.live?.cdp?.reused === true)
      && liveStepFailures.length === 0,
    releaseReport
      ? `release:verify captured ${releaseReport.capturedAt}, age ${releaseAgeHours.toFixed(2)}h, cdpStarted ${releaseReport.live?.cdp?.started === true}, cdpReused ${releaseReport.live?.cdp?.reused === true}`
      : `${RELEASE_REPORT} is missing; opt in with MM_ALLOW_BROWSER=1 npm run release:verify`,
    "blocker",
    {
      failedLiveSteps: liveStepFailures,
      releaseReport: RELEASE_REPORT,
    },
  );

  const blockers = checks.filter((check) => !check.pass && check.severity !== "warning");
  const warnings = checks.filter((check) => !check.pass && check.severity === "warning");
  const nextActions = releaseNextActions(checks);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    cdpStarted: false,
    candidate: {
      commit,
      branch,
      dirty: dirtyFiles.length > 0,
      dirtyCount: dirtyFiles.length,
      dirtyFiles: shortList(dirtyFiles, 40),
      dirtyScope,
      sourceFingerprint: currentFingerprint,
      sourceFingerprintSource: fingerprintDetails.source,
      sourceFingerprintFileCount: fingerprintDetails.files.length,
      buildJson,
    },
    policy: {
      maxSafeGateAgeHours: MAX_SAFE_GATE_AGE_HOURS,
      requireHostingLive: REQUIRE_HOSTING_LIVE,
      noBrowserReport: NO_BROWSER_REPORT,
      releaseReport: RELEASE_REPORT,
    },
    checks,
    blockers,
    warnings,
    nextActions,
    notes: [
      "This status command is report-only for production state, but it exits nonzero while release blockers remain.",
      "It reuses no-browser scripts and does not start Chrome/CDP; browser verification remains explicit opt-in via MM_ALLOW_BROWSER=1.",
      "The live:version child check also verifies removed background music files, including music.mp3, music.ogg, music.wav, music.m4a, music.aac, and music.flac.",
    ],
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    cdpStarted: report.cdpStarted,
    candidate: report.candidate,
    blockers: blockers.map((check) => `${check.name}: ${check.evidence}`),
    warnings: warnings.map((check) => `${check.name}: ${check.evidence}`),
    nextActions: report.nextActions,
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    cdpStarted: false,
    error: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  } catch {
    /* ignore report write failures */
  }
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
