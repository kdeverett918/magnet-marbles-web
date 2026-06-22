import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.DEPLOY_MONITOR_OUTPUT || "outputs/deploy-monitor.json";
const LIVE_WEB_URL = process.env.DEPLOY_MONITOR_WEB_URL || "https://magnet-marbles.onrender.com/";
const LIVE_SERVER_URL = process.env.DEPLOY_MONITOR_SERVER_URL || "wss://magnet-marbles-server.onrender.com";
const EXPECT_COMMIT = process.env.DEPLOY_MONITOR_EXPECT_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "");
const EXPECT_SOURCE_FINGERPRINT = process.env.DEPLOY_MONITOR_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();
const RUN_PROTOCOL_AFTER_VERSION_FAIL = process.env.DEPLOY_MONITOR_RUN_PROTOCOL_ON_VERSION_FAIL !== "0";

function commandOutput(command, args, fallback) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

function trimLog(value) {
  const text = String(value || "").trim();
  return text.length > 2_000 ? `${text.slice(-2_000)}\n[trimmed]` : text;
}

async function readJsonReport(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function runNodeStep(name, scriptPath, env, outputPath) {
  await rm(outputPath, { force: true });
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: Number(process.env.DEPLOY_MONITOR_STEP_TIMEOUT_MS || 180_000),
  });
  const report = await readJsonReport(outputPath);
  return {
    name,
    script: scriptPath,
    pass: result.status === 0 && report?.pass !== false,
    exitCode: result.status,
    elapsedMs: Math.round(performance.now() - startedAt),
    output: outputPath,
    stdout: trimLog(result.stdout),
    stderr: trimLog(result.stderr),
    report,
    error: result.error ? result.error.message : undefined,
  };
}

function failureReason(step) {
  if (Array.isArray(step.report?.blockers) && step.report.blockers.length > 0) return step.report.blockers.join("; ");
  if (step.report?.error) return step.report.error;
  if (step.error) return step.error;
  if (step.stderr) return step.stderr.split("\n").find((line) => line.trim())?.trim();
  return `exit code ${step.exitCode ?? "unknown"}`;
}

async function run() {
  const expectedCommitEnv = EXPECT_COMMIT ? { LIVE_VERSION_EXPECT_COMMIT: EXPECT_COMMIT } : {};
  const expectedSourceEnv = EXPECT_SOURCE_FINGERPRINT ? { LIVE_VERSION_EXPECT_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT } : {};
  const onlineCommitEnv = EXPECT_COMMIT ? { ONLINE_EXPECT_BUILD_COMMIT: EXPECT_COMMIT } : {};
  const onlineSourceEnv = EXPECT_SOURCE_FINGERPRINT ? { ONLINE_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT } : {};
  const modesCommitEnv = EXPECT_COMMIT ? { ONLINE_MODES_EXPECT_BUILD_COMMIT: EXPECT_COMMIT } : {};
  const modesSourceEnv = EXPECT_SOURCE_FINGERPRINT ? { ONLINE_MODES_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT } : {};
  const disconnectCommitEnv = EXPECT_COMMIT ? { ONLINE_DISCONNECT_EXPECT_BUILD_COMMIT: EXPECT_COMMIT } : {};
  const disconnectSourceEnv = EXPECT_SOURCE_FINGERPRINT ? { ONLINE_DISCONNECT_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT } : {};

  const steps = [];
  const version = await runNodeStep("live:version", "scripts/live-version-smoke.mjs", {
    ...expectedCommitEnv,
    ...expectedSourceEnv,
    LIVE_VERSION_WEB_URL: LIVE_WEB_URL,
    LIVE_VERSION_SERVER_URL: LIVE_SERVER_URL,
    LIVE_VERSION_OUTPUT: "outputs/deploy-live-version.json",
  }, "outputs/deploy-live-version.json");
  steps.push(version);

  if (version.pass || RUN_PROTOCOL_AFTER_VERSION_FAIL) {
    steps.push(await runNodeStep("live:online-classic", "scripts/online-smoke.mjs", {
      ...onlineCommitEnv,
      ...onlineSourceEnv,
      ONLINE_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_OUTPUT: "outputs/deploy-online-smoke.json",
      ONLINE_HEALTH_TIMEOUT_MS: "60000",
      ONLINE_JOIN_TIMEOUT_MS: "60000",
    }, "outputs/deploy-online-smoke.json"));

    steps.push(await runNodeStep("live:online-modes", "scripts/online-modes-smoke.mjs", {
      ...modesCommitEnv,
      ...modesSourceEnv,
      ONLINE_MODES_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_MODES_OUTPUT: "outputs/deploy-online-modes-smoke.json",
      ONLINE_MODES_HEALTH_TIMEOUT_MS: "60000",
      ONLINE_MODES_JOIN_TIMEOUT_MS: "60000",
    }, "outputs/deploy-online-modes-smoke.json"));

    steps.push(await runNodeStep("live:online-disconnect", "scripts/online-disconnect-smoke.mjs", {
      ...disconnectCommitEnv,
      ...disconnectSourceEnv,
      ONLINE_DISCONNECT_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_DISCONNECT_OUTPUT: "outputs/deploy-online-disconnect-smoke.json",
      ONLINE_DISCONNECT_HEALTH_TIMEOUT_MS: "60000",
      ONLINE_DISCONNECT_JOIN_TIMEOUT_MS: "60000",
    }, "outputs/deploy-online-disconnect-smoke.json"));
  }

  const blockers = steps
    .filter((step) => !step.pass)
    .map((step) => `${step.name} failed: ${failureReason(step)}`);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    cdpStarted: false,
    expectedCommit: EXPECT_COMMIT || null,
    expectedSourceFingerprint: EXPECT_SOURCE_FINGERPRINT || null,
    endpoints: {
      web: LIVE_WEB_URL,
      server: LIVE_SERVER_URL,
    },
    policy: {
      runProtocolAfterVersionFail: RUN_PROTOCOL_AFTER_VERSION_FAIL,
    },
    steps,
    blockers,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    cdpStarted: report.cdpStarted,
    expectedCommit: report.expectedCommit,
    expectedSourceFingerprint: report.expectedSourceFingerprint,
    steps: steps.map((step) => ({
      name: step.name,
      pass: step.pass,
      elapsedMs: step.elapsedMs,
      output: step.output,
    })),
    blockers,
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
