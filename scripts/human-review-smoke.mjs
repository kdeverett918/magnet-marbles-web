import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.HUMAN_AA_REVIEW_OUTPUT || "outputs/human-aa-review-smoke.json";
const EVIDENCE_PATH = process.env.HUMAN_AA_REVIEW_EVIDENCE || "outputs/human-aa-review-evidence.json";
const REQUIRE_EVIDENCE = process.env.HUMAN_AA_REVIEW_REQUIRE_EVIDENCE === "1";
const MAX_AGE_DAYS = Number(process.env.HUMAN_AA_REVIEW_MAX_AGE_DAYS || 14);
const EXPECT_COMMIT = process.env.HUMAN_AA_REVIEW_EXPECT_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
const EXPECT_SOURCE_FINGERPRINT = process.env.HUMAN_AA_REVIEW_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();
const CHECKLIST_PATH = "docs/HUMAN_AA_REVIEW_CHECKLIST.md";

const REQUIRED_PASSES = [
  "executive-producer-fun-30s",
  "gameplay-designer-core-loop",
  "mobile-ux-touch-readability",
  "art-audio-juice-aa",
  "accessibility-comfort",
  "release-qa-risk",
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
  for (const id of REQUIRED_PASSES) {
    if (!source.includes(`\`${id}\``)) addIssue(issues, `Checklist is missing required review pass ${id}`);
  }
  for (const phrase of [
    "outputs/human-aa-review-evidence.json",
    "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review",
    "RELEASE_REQUIRE_HUMAN_REVIEW=0",
    "fun-in-30-seconds",
    "Candidate stamp",
    "buildJson",
    "menuStamp",
    "shipDecision",
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
    if (ageDays > MAX_AGE_DAYS) addIssue(issues, `Evidence is stale: ${ageDays.toFixed(1)} days old, max ${MAX_AGE_DAYS}`);
  }

  const reviewers = Array.isArray(evidence.reviewers) ? evidence.reviewers : [];
  if (reviewers.length === 0) addIssue(issues, "Evidence must list at least one reviewer");
  for (const reviewer of reviewers) {
    if (!String(reviewer?.name || "").trim()) addIssue(issues, "Reviewer entry is missing name");
    if (!String(reviewer?.role || "").trim()) addIssue(issues, "Reviewer entry is missing role");
    rejectPlaceholder(issues, "Reviewer name", reviewer?.name);
    rejectPlaceholder(issues, "Reviewer role", reviewer?.role);
  }

  const sessions = Array.isArray(evidence.sessions) ? evidence.sessions : [];
  if (sessions.length < 2) addIssue(issues, "Evidence must include at least two review sessions");
  const sessionIds = new Set();
  for (const session of sessions) {
    const id = String(session?.id || "");
    if (id) sessionIds.add(id);
    for (const field of ["id", "platform", "mode", "notes"]) {
      if (!String(session?.[field] || "").trim()) addIssue(issues, `Session entry is missing ${field}`);
      rejectPlaceholder(issues, `Session ${id || "missing"} ${field}`, session?.[field]);
    }
    const duration = Number(session?.durationMinutes);
    if (!Number.isFinite(duration) || duration < 5) addIssue(issues, `Session ${id || "missing"} must be at least 5 minutes`);
  }
  if (!sessions.some((session) => /android|ios|iphone|mobile/i.test(String(session?.platform || "")))) {
    addIssue(issues, "Evidence must include at least one mobile review session");
  }

  const passes = evidence.passes || {};
  for (const id of REQUIRED_PASSES) {
    const item = passes[id];
    if (!item || typeof item !== "object") {
      addIssue(issues, `Evidence is missing required review pass ${id}`);
      continue;
    }
    if (item.pass !== true) addIssue(issues, `Required review pass ${id} did not pass`);
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < 4 || score > 5) addIssue(issues, `Required review pass ${id} must have score 4 or 5`);
    const notes = String(item.notes || "").trim();
    if (notes.length < 24) addIssue(issues, `Required review pass ${id} needs meaningful notes`);
    rejectPlaceholder(issues, `Required review pass ${id} notes`, notes);
    const itemSessions = Array.isArray(item.sessionIds) ? item.sessionIds : [];
    if (itemSessions.length === 0 || itemSessions.some((sessionId) => !sessionIds.has(String(sessionId)))) {
      addIssue(issues, `Required review pass ${id} needs valid sessionIds`);
    }
    if (!Array.isArray(item.evidence) || item.evidence.length === 0 || item.evidence.some((entry) => !String(entry || "").trim())) {
      addIssue(issues, `Required review pass ${id} needs at least one evidence reference`);
    } else {
      for (const [index, entry] of item.evidence.entries()) {
        rejectPlaceholder(issues, `Required review pass ${id} evidence ${index}`, entry);
      }
    }
  }

  if (Array.isArray(evidence.unresolvedBlockers) && evidence.unresolvedBlockers.length > 0) {
    addIssue(issues, `Evidence lists unresolved blockers: ${evidence.unresolvedBlockers.join("; ")}`);
  }
  if (evidence.shipDecision !== "ship") {
    addIssue(issues, `Evidence shipDecision must be "ship" for public release, got ${evidence.shipDecision || "missing"}`);
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
    addIssue(issues, `Human AA review evidence is required but missing: ${EVIDENCE_PATH}`);
  } else {
    addIssue(warnings, `Human AA review evidence is not present yet: ${EVIDENCE_PATH}`, "warning");
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
    requiredPasses: REQUIRED_PASSES,
    checklist: {
      path: CHECKLIST_PATH,
      bytes: checklistSource.length,
    },
    evidence: evidence ? {
      found: true,
      bytes: evidenceStat?.size ?? null,
      reviewedAt: evidence.reviewedAt ?? null,
      reviewerCount: Array.isArray(evidence.reviewers) ? evidence.reviewers.length : 0,
      sessionCount: Array.isArray(evidence.sessions) ? evidence.sessions.length : 0,
      passCount: evidence.passes && typeof evidence.passes === "object" ? Object.keys(evidence.passes).length : 0,
      shipDecision: evidence.shipDecision ?? null,
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
