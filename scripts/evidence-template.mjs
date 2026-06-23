import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT_DIR = process.env.EVIDENCE_TEMPLATE_OUTPUT_DIR || "outputs/evidence-templates";
const CANDIDATE_URL = process.env.EVIDENCE_TEMPLATE_URL || "https://magnet-marbles.onrender.com/";
const COMMIT = process.env.EVIDENCE_TEMPLATE_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
const SOURCE_FINGERPRINT = process.env.EVIDENCE_TEMPLATE_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();

const DEVICE_CHECKS = [
  ["android-chrome-install-offline", "android-midrange"],
  ["ios-safari-install-offline", "ios-safari"],
  ["touch-controls-core-loop", "android-midrange"],
  ["menu-readability-safe-area", "ios-safari"],
  ["midrange-android-performance", "android-midrange"],
  ["screen-reader-focus", "ios-safari"],
  ["haptics-audio-feel", "android-midrange"],
  ["online-cold-warm-recovery", "android-midrange"],
];

const HUMAN_PASSES = [
  "executive-producer-fun-30s",
  "gameplay-designer-core-loop",
  "mobile-ux-touch-readability",
  "art-audio-juice-aa",
  "accessibility-comfort",
  "release-qa-risk",
];

const REVIEW_START_REQUIREMENTS = [
  "`npm run live:version` passes for this commit and source fingerprint.",
  "`npm run release:status` has no `live:version-current-and-no-music` blocker.",
  "The deployed main menu Candidate stamp matches the commit/source fingerprint below.",
  "No `audio/music.*` background song plays during menu, gameplay, pause, or results.",
];

function commandOutput(command, args, fallback = "") {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

function candidate() {
  return {
    commit: COMMIT,
    sourceFingerprint: SOURCE_FINGERPRINT,
    url: CANDIDATE_URL,
    buildJson: {
      commit: COMMIT,
      sourceFingerprint: SOURCE_FINGERPRINT,
      verifiedAt: "TODO: ISO timestamp when deployed /build.json was checked",
    },
    menuStamp: {
      commit: COMMIT.slice(0, 8),
      sourceFingerprint: SOURCE_FINGERPRINT.slice(0, 8),
      evidence: ["TODO: screenshot/video/path showing the menu Candidate stamp"],
    },
  };
}

function deviceQaTemplate(now) {
  return {
    candidate: candidate(),
    reviewedAt: now,
    reviewer: "TODO: reviewer name or initials",
    devices: [
      {
        id: "android-midrange",
        platform: "Android",
        model: "TODO: device model",
        os: "TODO: Android version",
        browser: "Chrome current",
      },
      {
        id: "ios-safari",
        platform: "iOS",
        model: "TODO: iPhone model",
        os: "TODO: iOS version",
        browser: "Safari current",
      },
    ],
    checks: Object.fromEntries(DEVICE_CHECKS.map(([id, deviceId]) => [id, {
      pass: false,
      deviceId,
      notes: `TODO: complete ${id} against the deployed candidate.`,
      evidence: [`TODO: add photo/video/path/link for ${id}`],
    }])),
    blockers: ["TODO: remove this after every required physical-device check passes"],
  };
}

function humanReviewTemplate(now) {
  return {
    candidate: candidate(),
    reviewedAt: now,
    reviewers: [
      {
        name: "TODO: reviewer name",
        role: "TODO: producer / gameplay / QA / accessibility",
      },
    ],
    sessions: [
      {
        id: "mobile-solo-classic",
        platform: "TODO: Android Chrome or iOS Safari",
        mode: "Classic",
        durationMinutes: 0,
        notes: "TODO: play at least five minutes and summarize the session.",
      },
      {
        id: "desktop-or-second-mobile-all-modes",
        platform: "TODO: Desktop Chrome or second mobile browser",
        mode: "All modes",
        durationMinutes: 0,
        notes: "TODO: play at least five minutes and summarize the session.",
      },
    ],
    passes: Object.fromEntries(HUMAN_PASSES.map((id) => [id, {
      pass: false,
      score: 0,
      sessionIds: ["mobile-solo-classic"],
      notes: `TODO: complete ${id} with score 4 or 5.`,
      evidence: [`TODO: add screenshot/video/path/link for ${id}`],
    }])),
    unresolvedBlockers: ["TODO: remove this after every required human AA review pass succeeds"],
    topRisks: ["TODO: list remaining launch risks, or remove if none"],
    shipDecision: "hold",
  };
}

function reviewerHandoff(now) {
  return `# Magnet Marbles Review Handoff

Generated: ${now}

## Candidate

- URL: ${CANDIDATE_URL}
- Commit: ${COMMIT}
- Source fingerprint: ${SOURCE_FINGERPRINT}
- Menu Candidate stamp should show commit \`${COMMIT.slice(0, 8)}\` and source \`${SOURCE_FINGERPRINT.slice(0, 8)}\`.
- Deployed metadata to verify: \`${new URL("./build.json", CANDIDATE_URL).toString()}\`

## Review Start Gate

Do not begin phone QA or human AA review until all of these are true:

${REVIEW_START_REQUIREMENTS.map((item) => `- ${item}`).join("\n")}

If \`npm run live:version\` fails, the deployed URL is stale for this candidate.
Stop, redeploy the current candidate, and regenerate this handoff before capturing
screenshots, videos, device notes, or AA review evidence.

## Files To Fill

- Device QA final evidence: \`outputs/device-qa-evidence.json\`
- Human AA final evidence: \`outputs/human-aa-review-evidence.json\`
- Device QA starter: \`outputs/evidence-templates/device-qa-evidence.template.json\`
- Human AA starter: \`outputs/evidence-templates/human-aa-review-evidence.template.json\`

Do not submit the generated templates as final evidence. They intentionally contain TODO values and must fail strict validation.

## Required Captures

- Main menu Candidate stamp screenshot or video on a phone.
- Android Chrome install/add-to-home, offline reload after first online load, and one solo round restart.
- iOS Safari add-to-home, offline reload after first online load, and one solo round restart.
- Touch core loop: drag move, hold magnet, tap/flick dash, powerup, pause/resume, rematch.
- Ten-minute midrange Android-class performance/thermal note.
- Human screen-reader/focus pass.
- Human fun/feel review covering Classic plus the remaining launch modes.
- If a Table reset needed recovery screen appears, capture the visible \`MM-\` crash support code before using Reload or Reset local data.

## Validation Commands

\`\`\`bash
npm run release:status
npm run live:version
DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa
HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review
MM_ALLOW_BROWSER=1 npm run release:verify
\`\`\`

Browser/CDP checks are intentionally opt-in. Do not run \`MM_ALLOW_BROWSER=1 npm run release:verify\` until Chrome tabs are acceptable and the no-browser live/evidence checks pass.
`;
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function run() {
  const now = new Date().toISOString();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const devicePath = join(OUTPUT_DIR, "device-qa-evidence.template.json");
  const humanPath = join(OUTPUT_DIR, "human-aa-review-evidence.template.json");
  const handoffPath = join(OUTPUT_DIR, "reviewer-handoff.md");
  await writeJson(devicePath, deviceQaTemplate(now));
  await writeJson(humanPath, humanReviewTemplate(now));
  await writeFile(handoffPath, reviewerHandoff(now));

  const report = {
    pass: true,
    capturedAt: now,
    browserAutomation: false,
    outputDir: OUTPUT_DIR,
    candidate: candidate(),
    reviewStartGate: {
      requiredBeforeReview: true,
      requirements: REVIEW_START_REQUIREMENTS,
      staleLiveBuildInvalidatesEvidence: true,
    },
    templates: [
      {
        kind: "reviewer-handoff",
        path: handoffPath,
        finalPath: "outputs/evidence-templates/reviewer-handoff.md",
        validation: "Use as human-facing handoff only; strict JSON validators still gate release",
      },
      {
        kind: "device-qa",
        path: devicePath,
        finalPath: "outputs/device-qa-evidence.json",
        validation: "DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa",
      },
      {
        kind: "human-aa-review",
        path: humanPath,
        finalPath: "outputs/human-aa-review-evidence.json",
        validation: "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review",
      },
    ],
  };
  await writeJson(join(OUTPUT_DIR, "evidence-template-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
