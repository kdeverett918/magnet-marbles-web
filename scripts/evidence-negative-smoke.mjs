import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const OUTPUT = process.env.EVIDENCE_NEGATIVE_OUTPUT || "outputs/evidence-negative-smoke.json";
const TEMPLATE_DIR = process.env.EVIDENCE_TEMPLATE_OUTPUT_DIR || "outputs/evidence-templates";

function runNode(script, env = {}) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return {
    status: result.status,
    pass: result.status === 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    stdout: String(result.stdout || "").trim().slice(-4000),
    stderr: String(result.stderr || "").trim().slice(-4000),
    error: result.error?.message,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function blockerMessages(report) {
  return Array.isArray(report?.blockers)
    ? report.blockers.map((blocker) => String(blocker?.message || blocker)).join("\n")
    : "";
}

async function assertRejectedTemplate({ kind, script, evidencePath, outputPath, env, requiredNeedles }) {
  const run = runNode(script, {
    ...env,
    [kind === "device" ? "DEVICE_QA_REQUIRE_EVIDENCE" : "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE"]: "1",
    [kind === "device" ? "DEVICE_QA_EVIDENCE" : "HUMAN_AA_REVIEW_EVIDENCE"]: evidencePath,
    [kind === "device" ? "DEVICE_QA_OUTPUT" : "HUMAN_AA_REVIEW_OUTPUT"]: outputPath,
  });
  let report = null;
  try {
    report = await readJson(outputPath);
  } catch (error) {
    return {
      kind,
      pass: false,
      evidencePath,
      outputPath,
      run,
      error: `Could not read validator report: ${error.message}`,
    };
  }

  const messages = blockerMessages(report);
  const missingNeedles = requiredNeedles.filter((needle) => !messages.includes(needle));
  const rejected = run.status !== 0 && report.pass === false;
  return {
    kind,
    pass: rejected && missingNeedles.length === 0,
    evidencePath,
    outputPath,
    run: {
      status: run.status,
      elapsedMs: run.elapsedMs,
    },
    report: {
      pass: report.pass,
      blockerCount: Array.isArray(report.blockers) ? report.blockers.length : 0,
      expectedSourceFingerprint: report.expectedSourceFingerprint,
    },
    missingNeedles,
    error: rejected ? undefined : "Template validator did not fail as required",
  };
}

async function run() {
  const generator = runNode("scripts/evidence-template.mjs", {
    EVIDENCE_TEMPLATE_OUTPUT_DIR: TEMPLATE_DIR,
  });
  if (!generator.pass) {
    throw new Error(`Template generation failed: ${generator.stderr || generator.stdout || generator.error || "unknown error"}`);
  }

  const device = await assertRejectedTemplate({
    kind: "device",
    script: "scripts/device-qa-smoke.mjs",
    evidencePath: join(TEMPLATE_DIR, "device-qa-evidence.template.json"),
    outputPath: "outputs/device-qa-template-negative.json",
    requiredNeedles: [
      "candidate.buildJson.verifiedAt",
      "candidate.menuStamp.evidence",
      "placeholder",
      "Required check android-chrome-install-offline did not pass",
    ],
  });
  const human = await assertRejectedTemplate({
    kind: "human",
    script: "scripts/human-review-smoke.mjs",
    evidencePath: join(TEMPLATE_DIR, "human-aa-review-evidence.template.json"),
    outputPath: "outputs/human-review-template-negative.json",
    requiredNeedles: [
      "candidate.buildJson.verifiedAt",
      "candidate.menuStamp.evidence",
      "placeholder",
      "shipDecision",
    ],
  });

  const checks = [device, human];
  const report = {
    pass: checks.every((check) => check.pass),
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    templateDir: TEMPLATE_DIR,
    generator: {
      status: generator.status,
      elapsedMs: generator.elapsedMs,
    },
    checks,
    blockers: checks
      .filter((check) => !check.pass)
      .map((check) => `${check.kind}: ${check.error || `missing expected blocker text ${check.missingNeedles.join(", ")}`}`),
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    checks: checks.map((check) => ({
      kind: check.kind,
      pass: check.pass,
      blockerCount: check.report?.blockerCount ?? 0,
      missingNeedles: check.missingNeedles,
    })),
    blockers: report.blockers,
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
