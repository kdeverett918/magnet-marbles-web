import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.DEVICE_QA_OUTPUT || "outputs/device-qa-smoke.json";
const EVIDENCE_PATH = process.env.DEVICE_QA_EVIDENCE || "outputs/device-qa-evidence.json";
const REQUIRE_EVIDENCE = process.env.DEVICE_QA_REQUIRE_EVIDENCE === "1";
const MAX_AGE_DAYS = Number(process.env.DEVICE_QA_MAX_AGE_DAYS || 14);
const EXPECT_COMMIT = process.env.DEVICE_QA_EXPECT_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
const EXPECT_SOURCE_FINGERPRINT = process.env.DEVICE_QA_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();
const CHECKLIST_PATH = "docs/DEVICE_QA_CHECKLIST.md";

const REQUIRED_CHECKS = [
  "android-chrome-install-offline",
  "ios-safari-install-offline",
  "touch-controls-core-loop",
  "menu-readability-safe-area",
  "midrange-android-performance",
  "screen-reader-focus",
  "haptics-audio-feel",
  "online-cold-warm-recovery",
];
const PLACEHOLDER_PATTERN = /^(todo|tbd|placeholder)\b/i;

function commandOutput(command, args, fallback = "") {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

function addIssue(issues, message, severity = "blocker") {
  issues.push({ severity, message });
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERN.test(String(value || "").trim());
}

function rejectPlaceholder(issues, label, value) {
  if (isPlaceholder(value)) addIssue(issues, `${label} still contains a placeholder value`);
}

function commitMatchesCandidate(commit) {
  const value = String(commit || "");
  return value && (EXPECT_COMMIT.startsWith(value) || value.startsWith(EXPECT_COMMIT));
}

function fingerprintMatchesCandidate(fingerprint, { allowPrefix = false } = {}) {
  const value = String(fingerprint || "");
  if (!value) return false;
  if (value === EXPECT_SOURCE_FINGERPRINT) return true;
  return allowPrefix && (EXPECT_SOURCE_FINGERPRINT.startsWith(value) || value.startsWith(EXPECT_SOURCE_FINGERPRINT));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateChecklist(source, issues) {
  for (const id of REQUIRED_CHECKS) {
    if (!source.includes(`\`${id}\``)) addIssue(issues, `Checklist is missing required check ${id}`);
  }
  for (const phrase of [
    "outputs/device-qa-evidence.json",
    "DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa",
    "RELEASE_REQUIRE_DEVICE_QA=0",
    "Android Chrome",
    "iOS Safari",
    "Candidate stamp",
    "buildJson",
    "menuStamp",
    "npm run live:version",
    "live:version-current-and-no-music",
  ]) {
    if (!source.includes(phrase)) addIssue(issues, `Checklist is missing release guidance phrase: ${phrase}`);
  }
}

function validateCandidateProof(candidate, issues) {
  const buildJson = candidate.buildJson || {};
  if (!commitMatchesCandidate(buildJson.commit)) {
    addIssue(issues, `Evidence candidate.buildJson.commit ${buildJson.commit || "missing"} does not match current candidate ${EXPECT_COMMIT}`);
  }
  if (!fingerprintMatchesCandidate(buildJson.sourceFingerprint)) {
    addIssue(issues, `Evidence candidate.buildJson.sourceFingerprint ${buildJson.sourceFingerprint || "missing"} does not match current candidate ${EXPECT_SOURCE_FINGERPRINT}`);
  }
  const buildJsonVerifiedAtMs = Date.parse(buildJson.verifiedAt || "");
  if (!Number.isFinite(buildJsonVerifiedAtMs)) {
    addIssue(issues, "Evidence candidate.buildJson.verifiedAt must be an ISO timestamp");
  }
  rejectPlaceholder(issues, "Evidence candidate.buildJson.verifiedAt", buildJson.verifiedAt);

  const menuStamp = candidate.menuStamp || {};
  if (!commitMatchesCandidate(menuStamp.commit)) {
    addIssue(issues, `Evidence candidate.menuStamp.commit ${menuStamp.commit || "missing"} does not match current candidate ${EXPECT_COMMIT}`);
  }
  if (!fingerprintMatchesCandidate(menuStamp.sourceFingerprint, { allowPrefix: true })) {
    addIssue(issues, `Evidence candidate.menuStamp.sourceFingerprint ${menuStamp.sourceFingerprint || "missing"} does not match current candidate ${EXPECT_SOURCE_FINGERPRINT}`);
  }
  if (!Array.isArray(menuStamp.evidence) || menuStamp.evidence.length === 0 || menuStamp.evidence.some((item) => !String(item || "").trim())) {
    addIssue(issues, "Evidence candidate.menuStamp.evidence needs at least one screenshot/video/reference");
  } else {
    for (const [index, item] of menuStamp.evidence.entries()) {
      rejectPlaceholder(issues, `Evidence candidate.menuStamp.evidence ${index}`, item);
    }
  }
}

function validateEvidenceShape(evidence, issues) {
  if (!evidence || typeof evidence !== "object") {
    addIssue(issues, "Evidence JSON must be an object");
    return;
  }

  const candidate = evidence.candidate || {};
  const commit = String(candidate.commit || "");
  const sourceFingerprint = String(candidate.sourceFingerprint || "");
  if (!commitMatchesCandidate(commit)) {
    addIssue(issues, `Evidence commit ${commit || "missing"} does not match current candidate ${EXPECT_COMMIT}`);
  }
  if (!fingerprintMatchesCandidate(sourceFingerprint)) {
    addIssue(issues, `Evidence source fingerprint ${sourceFingerprint || "missing"} does not match current candidate ${EXPECT_SOURCE_FINGERPRINT}`);
  }
  if (!/^https:\/\/.+/.test(String(candidate.url || ""))) {
    addIssue(issues, "Evidence candidate.url must be an https deployment URL");
  }
  validateCandidateProof(candidate, issues);

  const reviewedAtMs = Date.parse(evidence.reviewedAt || "");
  if (!Number.isFinite(reviewedAtMs)) {
    addIssue(issues, "Evidence reviewedAt must be an ISO timestamp");
  } else {
    const ageDays = (Date.now() - reviewedAtMs) / 86_400_000;
    if (ageDays < -1) addIssue(issues, "Evidence reviewedAt is in the future");
    if (ageDays > MAX_AGE_DAYS) {
      addIssue(issues, `Evidence is stale: ${ageDays.toFixed(1)} days old, max ${MAX_AGE_DAYS}`);
    }
  }

  if (!String(evidence.reviewer || "").trim()) {
    addIssue(issues, "Evidence reviewer is required");
  }
  rejectPlaceholder(issues, "Evidence reviewer", evidence.reviewer);

  const devices = Array.isArray(evidence.devices) ? evidence.devices : [];
  if (devices.length < 2) addIssue(issues, "Evidence must list at least Android and iOS devices");
  const deviceIds = new Set();
  for (const device of devices) {
    if (!device || typeof device !== "object") continue;
    const id = String(device.id || "");
    if (id) deviceIds.add(id);
    for (const field of ["id", "platform", "model", "os", "browser"]) {
      if (!String(device[field] || "").trim()) addIssue(issues, `Device entry is missing ${field}`);
      rejectPlaceholder(issues, `Device ${id || "missing"} ${field}`, device[field]);
    }
  }

  const platforms = devices.map((device) => String(device.platform || "").toLowerCase());
  if (!platforms.some((platform) => platform.includes("android"))) addIssue(issues, "Evidence must include an Android device");
  if (!platforms.some((platform) => platform.includes("ios") || platform.includes("iphone"))) addIssue(issues, "Evidence must include an iOS device");

  const checks = evidence.checks || {};
  for (const id of REQUIRED_CHECKS) {
    const check = checks[id];
    if (!check || typeof check !== "object") {
      addIssue(issues, `Evidence is missing required check ${id}`);
      continue;
    }
    if (check.pass !== true) addIssue(issues, `Required check ${id} did not pass`);
    if (!deviceIds.has(String(check.deviceId || ""))) {
      addIssue(issues, `Required check ${id} references unknown deviceId ${check.deviceId || "missing"}`);
    }
    const notes = String(check.notes || "").trim();
    if (notes.length < 12) {
      addIssue(issues, `Required check ${id} needs meaningful notes`);
    }
    rejectPlaceholder(issues, `Required check ${id} notes`, notes);
    if (!Array.isArray(check.evidence) || check.evidence.length === 0 || check.evidence.some((item) => !String(item || "").trim())) {
      addIssue(issues, `Required check ${id} needs at least one evidence reference`);
    } else {
      for (const [index, item] of check.evidence.entries()) {
        rejectPlaceholder(issues, `Required check ${id} evidence ${index}`, item);
      }
    }
  }

  if (Array.isArray(evidence.blockers) && evidence.blockers.length > 0) {
    addIssue(issues, `Evidence lists unresolved blockers: ${evidence.blockers.join("; ")}`);
  }
}

async function run() {
  const issues = [];
  const warnings = [];
  const checklistSource = await readFile(CHECKLIST_PATH, "utf8");
  validateChecklist(checklistSource, issues);

  let evidence = null;
  let evidenceStat = null;
  if (existsSync(EVIDENCE_PATH)) {
    evidenceStat = await stat(EVIDENCE_PATH);
    try {
      evidence = await readJson(EVIDENCE_PATH);
      validateEvidenceShape(evidence, issues);
    } catch (error) {
      addIssue(issues, `Could not parse ${EVIDENCE_PATH}: ${error.message}`);
    }
  } else if (REQUIRE_EVIDENCE) {
    addIssue(issues, `Physical-device evidence is required but missing: ${EVIDENCE_PATH}`);
  } else {
    addIssue(warnings, `Physical-device evidence is not present yet: ${EVIDENCE_PATH}`, "warning");
  }

  const blockers = issues.filter((issue) => issue.severity !== "warning");
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    requireEvidence: REQUIRE_EVIDENCE,
    evidencePath: EVIDENCE_PATH,
    expectedCommit: EXPECT_COMMIT,
    expectedSourceFingerprint: EXPECT_SOURCE_FINGERPRINT,
    maxAgeDays: MAX_AGE_DAYS,
    requiredChecks: REQUIRED_CHECKS,
    checklist: {
      path: CHECKLIST_PATH,
      bytes: checklistSource.length,
    },
    evidence: evidence ? {
      found: true,
      bytes: evidenceStat?.size ?? null,
      reviewedAt: evidence.reviewedAt ?? null,
      deviceCount: Array.isArray(evidence.devices) ? evidence.devices.length : 0,
      checkCount: evidence.checks && typeof evidence.checks === "object" ? Object.keys(evidence.checks).length : 0,
    } : { found: false },
    blockers,
    warnings,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    requireEvidence: report.requireEvidence,
    evidence: report.evidence,
    blockers: blockers.map((issue) => issue.message),
    warnings: warnings.map((issue) => issue.message),
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
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
  process.exitCode = 1;
});
