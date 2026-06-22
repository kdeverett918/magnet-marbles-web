import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";
import {
  DEFAULT_CDP_PORT,
  browserLaunchAllowed,
  browserLaunchOptInMessage,
  cdpReady,
  delay,
  startCdpBrowser,
  stopCdpBrowser,
} from "./lib/cdp-browser.mjs";

const OUTPUT = process.env.RELEASE_OUTPUT || "outputs/release-readiness.json";
const LIVE_WEB_URL = process.env.RELEASE_LIVE_WEB_URL || "https://magnet-marbles.onrender.com/";
const LIVE_SERVER_URL = process.env.RELEASE_LIVE_SERVER_URL || "wss://magnet-marbles-server.onrender.com";
const LOCAL_REPORT = process.env.RELEASE_LOCAL_REPORT || firstExisting([
  "outputs/launch-check-progression-mobile-perf.json",
  "outputs/launch-check-pwa-assets-mobile-perf.json",
  "outputs/launch-check-clean-audit-mobile-perf.json",
  "outputs/launch-check-metadata-mobile-perf.json",
  "outputs/launch-check-mobile-perf.json",
  "outputs/launch-check.json",
]);
const MAX_LOCAL_REPORT_AGE_HOURS = Number(process.env.RELEASE_MAX_LOCAL_REPORT_AGE_HOURS || 24);
const REQUIRE_CLEAN = process.env.RELEASE_ALLOW_DIRTY !== "1";
const REQUIRE_METADATA = process.env.RELEASE_REQUIRE_METADATA !== "0";
const REQUIRE_MOBILE_PERF = process.env.RELEASE_REQUIRE_MOBILE_PERF !== "0";
const SKIP_LIVE = process.env.RELEASE_SKIP_LIVE === "1";
const CDP_PORT = Number(process.env.RELEASE_CDP_PORT || process.env.MM_CDP_PORT || DEFAULT_CDP_PORT);
const EXPECT_SOURCE_FINGERPRINT = process.env.RELEASE_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) || paths[0];
}

function commandOutput(command, args, fallback = "") {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() : fallback;
  } catch {
    return fallback;
  }
}

function gitDirty() {
  return commandOutput("git", ["status", "--porcelain"], "").length > 0;
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

function tail(text, max = 3500) {
  if (!text) return "";
  return text.length <= max ? text : text.slice(-max);
}

function healthUrlForEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function fetchHealth(endpoint, timeoutMs = 60_000) {
  const healthUrl = healthUrlForEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(healthUrl, { cache: "no-store", signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return {
      url: healthUrl,
      pass: response.ok,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body,
      build: body?.build ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWebBuild(webUrl, timeoutMs = 15_000) {
  const url = new URL("./build.json", webUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return {
      url,
      pass: response.ok && body !== null,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      build: body,
      body: body === null ? text.slice(0, 500) : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

function failureText(step) {
  const lines = [step.error, step.stderr, step.stdout]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => line.startsWith("Error:")) || lines.at(-1) || "failed";
}

function skippedLiveStep(name, error) {
  return {
    name,
    pass: false,
    skipped: true,
    elapsedMs: 0,
    error,
  };
}

function buildMatchesCandidate(build, commit) {
  const actualCommit = String(build?.commit || "");
  const actualSource = String(build?.sourceFingerprint || "");
  return {
    commit: actualCommit,
    sourceFingerprint: actualSource,
    commitMatches: actualCommit.startsWith(commit),
    sourceMatches: actualSource === EXPECT_SOURCE_FINGERPRINT,
  };
}

async function liveWebBuildStep(commit) {
  const startedAt = performance.now();
  try {
    const webBuild = await fetchWebBuild(LIVE_WEB_URL);
    const match = buildMatchesCandidate(webBuild.build, commit);
    const webBuildPass = webBuild.pass && match.commitMatches && match.sourceMatches;
    return {
      step: {
        name: "live:web-build-version",
        pass: webBuildPass,
        elapsedMs: webBuild.elapsedMs,
        result: webBuild,
        error: webBuildPass
          ? undefined
          : !match.commitMatches
          ? `Web build commit ${match.commit || "missing"} did not match expected ${commit}`
          : `Web source fingerprint ${match.sourceFingerprint || "missing"} did not match expected ${EXPECT_SOURCE_FINGERPRINT}`,
      },
      pass: webBuildPass,
    };
  } catch (error) {
    return {
      step: {
        name: "live:web-build-version",
        pass: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: `Could not fetch live web build metadata: ${error.message}`,
      },
      pass: false,
    };
  }
}

async function liveServerHealthStep(commit) {
  const startedAt = performance.now();
  try {
    const serverHealth = await fetchHealth(LIVE_SERVER_URL);
    const match = buildMatchesCandidate(serverHealth.build, commit);
    const serverHealthPass = serverHealth.pass && match.commitMatches && match.sourceMatches;
    return {
      step: {
        name: "live:server-health-version",
        pass: serverHealthPass,
        elapsedMs: serverHealth.elapsedMs,
        result: serverHealth,
        error: serverHealthPass
          ? undefined
          : !match.commitMatches
          ? `Server build commit ${match.commit || "missing"} did not match expected ${commit}`
          : `Server source fingerprint ${match.sourceFingerprint || "missing"} did not match expected ${EXPECT_SOURCE_FINGERPRINT}`,
      },
      pass: serverHealthPass,
    };
  } catch (error) {
    return {
      step: {
        name: "live:server-health-version",
        pass: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: `Could not fetch live server health metadata: ${error.message}`,
      },
      pass: false,
    };
  }
}

async function waitForCdp(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpReady(port)) return;
    await delay(150);
  }
  throw new Error(`Shared Chrome CDP did not become ready on port ${port}`);
}

function runNodeScript(script, env) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      resolve({
        pass: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error.message,
        stdout: tail(stdout),
        stderr: tail(stderr),
      });
    });
    child.on("exit", (code) => {
      resolve({
        pass: code === 0,
        code,
        elapsedMs: Math.round(performance.now() - startedAt),
        stdout: tail(stdout),
        stderr: tail(stderr),
      });
    });
  });
}

async function localReportStatus(blockers) {
  const status = { path: LOCAL_REPORT, found: existsSync(LOCAL_REPORT) };
  if (!status.found) {
    blockers.push(`Local launch report is missing: ${LOCAL_REPORT}`);
    return status;
  }

  try {
    const fileStat = await stat(LOCAL_REPORT);
    const report = await readJson(LOCAL_REPORT);
    const capturedAtMs = report.capturedAt ? Date.parse(report.capturedAt) : fileStat.mtimeMs;
    const ageHours = Number(((Date.now() - capturedAtMs) / 3_600_000).toFixed(2));
    status.pass = report.pass === true;
    status.capturedAt = report.capturedAt || new Date(fileStat.mtimeMs).toISOString();
    status.ageHours = ageHours;
    status.metadata = report.steps?.some((step) => step.name === "web:metadata-smoke" && step.pass);
    status.mobilePerf = report.mobilePerf === true || report.steps?.some((step) => step.name === "smoke:mobile-perf" && step.pass);
    status.steps = Array.isArray(report.steps) ? report.steps.length : 0;

    if (!status.pass) blockers.push(`Local launch report did not pass: ${LOCAL_REPORT}`);
    if (ageHours > MAX_LOCAL_REPORT_AGE_HOURS) {
      blockers.push(`Local launch report is stale: ${ageHours}h old, max ${MAX_LOCAL_REPORT_AGE_HOURS}h`);
    }
    if (REQUIRE_METADATA && !status.metadata) {
      blockers.push("Local launch report did not include the metadata/installability smoke");
    }
    if (REQUIRE_MOBILE_PERF && !status.mobilePerf) {
      blockers.push("Local launch report did not include the opt-in mobile performance gate");
    }
    return status;
  } catch (error) {
    blockers.push(`Could not read local launch report ${LOCAL_REPORT}: ${error.message}`);
    return { ...status, error: error.message };
  }
}

async function runLiveChecks(commit, blockers) {
  if (SKIP_LIVE) return { skipped: true, steps: [] };

  const steps = [];
  const webPreflight = await liveWebBuildStep(commit);
  steps.push(webPreflight.step);

  const serverPreflight = await liveServerHealthStep(commit);
  steps.push(serverPreflight.step);

  const preflightPass = webPreflight.pass && serverPreflight.pass;
  if (!preflightPass) {
    const reason = "Skipped because live build/version preflight failed; Chrome/CDP was not started";
    steps.push(skippedLiveStep("live:web", reason));
    steps.push(skippedLiveStep("live:online-classic", reason));
    steps.push(skippedLiveStep("live:online-modes", reason));
    steps.push(skippedLiveStep("live:online-disconnect", reason));

    for (const step of steps) {
      if (!step.pass) blockers.push(`${step.name} failed: ${failureText(step)}`);
    }

    return {
      skipped: false,
      cdp: { port: CDP_PORT, chrome: null, reused: false, started: false },
      preflight: { web: webPreflight.pass, server: serverPreflight.pass },
      steps,
    };
  }

  steps.push({
    name: "live:online-classic",
    ...(await runNodeScript("scripts/online-smoke.mjs", {
      ONLINE_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_EXPECT_BUILD_COMMIT: commit,
      ONLINE_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT,
      ONLINE_OUTPUT: "outputs/release-online-smoke.json",
      ONLINE_HEALTH_TIMEOUT_MS: "60000",
      ONLINE_JOIN_TIMEOUT_MS: "60000",
    })),
  });

  steps.push({
    name: "live:online-modes",
    ...(await runNodeScript("scripts/live-online-modes-smoke.mjs", {
      ONLINE_MODES_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_MODES_EXPECT_BUILD_COMMIT: commit,
      ONLINE_MODES_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT,
      ONLINE_MODES_OUTPUT: "outputs/release-online-modes-smoke.json",
    })),
  });

  steps.push({
    name: "live:online-disconnect",
    ...(await runNodeScript("scripts/online-disconnect-smoke.mjs", {
      ONLINE_DISCONNECT_SERVER_URL: LIVE_SERVER_URL,
      ONLINE_DISCONNECT_EXPECT_BUILD_COMMIT: commit,
      ONLINE_DISCONNECT_EXPECT_BUILD_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT,
      ONLINE_DISCONNECT_OUTPUT: "outputs/release-online-disconnect-smoke.json",
      ONLINE_DISCONNECT_HEALTH_TIMEOUT_MS: "60000",
      ONLINE_DISCONNECT_HEALTH_POLL_MS: "1000",
      ONLINE_DISCONNECT_JOIN_TIMEOUT_MS: "60000",
    })),
  });

  if (!browserLaunchAllowed()) {
    const reason = browserLaunchOptInMessage();
    steps.push(skippedLiveStep("live:web", reason));
    for (const step of steps) {
      if (!step.pass) blockers.push(`${step.name} failed: ${failureText(step)}`);
    }
    return {
      skipped: false,
      cdp: { port: CDP_PORT, chrome: null, reused: false, started: false },
      preflight: { web: webPreflight.pass, server: serverPreflight.pass },
      steps,
    };
  }

  const browser = await startCdpBrowser({
    port: CDP_PORT,
    profilePrefix: "magnet-marbles-release-chrome-",
    windowSize: "390,844",
  });

  try {
    await waitForCdp(CDP_PORT);
    steps.push({
      name: "live:web",
      ...(await runNodeScript("scripts/live-web-smoke.mjs", {
        MM_CDP_PORT: String(CDP_PORT),
        MM_REUSE_CDP: "1",
        PREVIEW_URL: LIVE_WEB_URL,
        PREVIEW_EXPECT_BUILD_COMMIT: commit,
        PREVIEW_EXPECT_SOURCE_FINGERPRINT: EXPECT_SOURCE_FINGERPRINT,
        PREVIEW_OUTPUT: "outputs/release-live-web-smoke.json",
        PREVIEW_SCREENSHOT: "outputs/release-live-web-smoke.png",
        PREVIEW_MENU_SCREENSHOT: "outputs/release-live-web-menu.png",
      })),
    });
  } finally {
    await stopCdpBrowser(browser);
  }

  for (const step of steps) {
    if (!step.pass) blockers.push(`${step.name} failed: ${failureText(step)}`);
  }

  return {
    skipped: false,
    cdp: { port: CDP_PORT, chrome: browser.chrome, reused: !browser.launched, started: true },
    preflight: { web: webPreflight.pass, server: serverPreflight.pass },
    steps,
  };
}

async function run() {
  const blockers = [];
  const commit = commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
  const branch = commandOutput("git", ["branch", "--show-current"], "unknown");
  const dirty = gitDirty();

  if (REQUIRE_CLEAN && dirty) {
    blockers.push("Working tree is dirty. Commit the release candidate before public deployment verification, or set RELEASE_ALLOW_DIRTY=1 for a local-only audit.");
  }

  const localReport = await localReportStatus(blockers);
  const live = await runLiveChecks(commit, blockers);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    commit,
    branch,
    dirty,
    sourceFingerprint: EXPECT_SOURCE_FINGERPRINT,
    policy: {
      requireClean: REQUIRE_CLEAN,
      requireMetadata: REQUIRE_METADATA,
      requireMobilePerf: REQUIRE_MOBILE_PERF,
      maxLocalReportAgeHours: MAX_LOCAL_REPORT_AGE_HOURS,
      skipLive: SKIP_LIVE,
    },
    endpoints: {
      web: LIVE_WEB_URL,
      server: LIVE_SERVER_URL,
    },
    localReport,
    live,
    blockers,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    blockers,
    live: live.skipped ? "skipped" : live.steps.map((step) => ({ name: step.name, pass: step.pass, elapsedMs: step.elapsedMs })),
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
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
  process.exitCode = 1;
});
