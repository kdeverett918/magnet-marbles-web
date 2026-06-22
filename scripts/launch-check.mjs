import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { DEFAULT_CDP_PORT, cdpReady, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const ROOT = process.cwd();
const SERVER_DIR = `${ROOT}/server`;
const OUTPUT = process.env.LAUNCH_OUTPUT || "outputs/launch-check.json";
const WEB_URL = process.env.LAUNCH_WEB_URL || "http://127.0.0.1:5173/";
const WEB_PORT = Number(new URL(WEB_URL).port || 5173);
const PREVIEW_URL = process.env.LAUNCH_PREVIEW_URL || "http://127.0.0.1:4173/";
const PREVIEW_PORT = Number(new URL(PREVIEW_URL).port || 4173);
const LOCAL_SERVER_URL = process.env.LAUNCH_LOCAL_SERVER_URL || "ws://127.0.0.1:2568";
const LOCAL_HEALTH_URL = healthUrlForEndpoint(LOCAL_SERVER_URL);
const LOCAL_SERVER_PORT = Number(new URL(LOCAL_HEALTH_URL).port || 2567);
const RUN_LIVE_ONLINE = process.env.LAUNCH_SKIP_LIVE_ONLINE !== "1";
const RUN_LIVE_WEB = process.env.LAUNCH_CHECK_LIVE_WEB === "1";
const RUN_LIVE_VERSION = process.env.LAUNCH_CHECK_LIVE_VERSION === "1";
const RUN_LIVE_ONLINE_MODES = process.env.LAUNCH_CHECK_LIVE_ONLINE_MODES === "1";
const RUN_MOBILE_PERF = process.env.LAUNCH_CHECK_MOBILE_PERF === "1";
const USE_SHARED_CDP = process.env.LAUNCH_SHARED_CDP !== "0";
const SHARED_CDP_PORT = Number(process.env.LAUNCH_CDP_PORT || process.env.MM_CDP_PORT || DEFAULT_CDP_PORT);
const EXPECT_BUILD_COMMIT = process.env.LAUNCH_EXPECT_BUILD_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown");
const EXPECT_BUILD_BRANCH = process.env.LAUNCH_EXPECT_BUILD_BRANCH || commandOutput("git", ["branch", "--show-current"], "unknown");
const BUILD_TIME = new Date().toISOString();
const npmCmd = "npm";

const startedProcesses = [];
const steps = [];
function healthUrlForEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function commandOutput(command, args, fallback) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function webReady(url) {
  try {
    const response = await fetchText(url);
    return response.ok && response.text.includes("Magnet Marbles");
  } catch {
    return false;
  }
}

async function healthReady(url) {
  try {
    const response = await fetchText(url);
    return response.ok && response.text.includes("ok");
  } catch {
    return false;
  }
}

async function healthDetails(url) {
  try {
    const response = await fetchText(url);
    if (!response.ok) return null;
    return JSON.parse(response.text);
  } catch {
    return null;
  }
}

function buildMatchesExpected(build) {
  return EXPECT_BUILD_COMMIT === "unknown" || String(build?.commit || "").startsWith(EXPECT_BUILD_COMMIT);
}

async function waitUntil(label, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(250);
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds`);
}

function runProcess(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawnCrossPlatform(command, args, {
      cwd: opts.cwd || ROOT,
      env: { ...process.env, ...opts.env },
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
    child.on("error", reject);
    child.on("exit", (code) => {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const result = { code, elapsedMs, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0) resolve(result);
      else {
        const error = new Error(`${command} ${args.join(" ")} exited ${code}`);
        error.result = result;
        reject(error);
      }
    });
  });
}

function quoteWindowsArg(arg) {
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function spawnCrossPlatform(command, args, opts) {
  if (process.platform === "win32" && command === npmCmd) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")], opts);
  }
  return spawn(command, args, opts);
}

async function step(name, fn) {
  const startedAt = performance.now();
  try {
    const result = await fn();
    const entry = { name, pass: true, elapsedMs: Math.round(performance.now() - startedAt), result };
    steps.push(entry);
    return entry;
  } catch (error) {
    const entry = {
      name,
      pass: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      result: error?.result,
    };
    steps.push(entry);
    throw error;
  }
}

async function npmRun(name, env = {}) {
  return runProcess(npmCmd, ["run", name], { cwd: ROOT, env });
}

async function serverNpm(args, env = {}) {
  return runProcess(npmCmd, args, { cwd: SERVER_DIR, env });
}

function startNpm(args, opts = {}) {
  const child = spawnCrossPlatform(npmCmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString().trim()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString().trim()));
  child.on("exit", (code) => output.push(`process exited ${code}`));
  startedProcesses.push({ child, output, args, cwd: opts.cwd || ROOT });
  return child;
}

async function ensureSharedBrowser() {
  if (!USE_SHARED_CDP) return { enabled: false };
  const browser = await startCdpBrowser({
    port: SHARED_CDP_PORT,
    profilePrefix: "magnet-marbles-launch-chrome-",
    windowSize: "1440,900",
  });

  if (!browser.launched) return { enabled: true, port: SHARED_CDP_PORT, reused: true };

  startedProcesses.push({
    browser,
    output: [],
    args: ["shared-chrome", `--remote-debugging-port=${SHARED_CDP_PORT}`],
    cwd: ROOT,
  });

  await waitUntil("shared Chrome CDP browser", () => cdpReady(SHARED_CDP_PORT), 10_000);
  return { enabled: true, port: SHARED_CDP_PORT, reused: false, chrome: browser.chrome };
}

function browserSmokeEnv(env = {}) {
  if (!USE_SHARED_CDP) return env;
  return {
    ...env,
    MM_CDP_PORT: String(SHARED_CDP_PORT),
    MM_REUSE_CDP: "1",
  };
}

async function ensureWebServer() {
  if (await webReady(WEB_URL)) return { url: WEB_URL, reused: true };
  startNpm(["run", "dev", "--", "--host", "127.0.0.1", "--port", String(WEB_PORT)]);
  await waitUntil("Vite dev server", () => webReady(WEB_URL), 25_000);
  return { url: WEB_URL, reused: false };
}

async function ensurePreviewServer() {
  if (await webReady(PREVIEW_URL)) return { url: PREVIEW_URL, reused: true };
  startNpm(["run", "preview", "--", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT)]);
  await waitUntil("Vite preview server", () => webReady(PREVIEW_URL), 25_000);
  return { url: PREVIEW_URL, reused: false };
}

async function ensureLocalGameServer() {
  const existing = await healthDetails(LOCAL_HEALTH_URL);
  if (existing?.ok) {
    if (!buildMatchesExpected(existing.build)) {
      throw new Error(`Local game server on ${LOCAL_HEALTH_URL} is stale or unversioned. Expected ${EXPECT_BUILD_COMMIT}, got ${existing.build?.commit || "missing"}. Stop it or use LAUNCH_LOCAL_SERVER_URL with a free port.`);
    }
    return { endpoint: LOCAL_SERVER_URL, healthUrl: LOCAL_HEALTH_URL, reused: true, build: existing.build ?? null };
  }
  startNpm(["run", "start"], {
    cwd: SERVER_DIR,
    env: {
      PORT: String(LOCAL_SERVER_PORT),
      GIT_COMMIT: EXPECT_BUILD_COMMIT,
      GIT_BRANCH: EXPECT_BUILD_BRANCH,
      BUILD_TIME,
    },
  });
  await waitUntil("local game server", async () => {
    const health = await healthDetails(LOCAL_HEALTH_URL);
    return Boolean(health?.ok && buildMatchesExpected(health.build));
  }, 20_000);
  return { endpoint: LOCAL_SERVER_URL, healthUrl: LOCAL_HEALTH_URL, reused: false };
}

async function stopStartedProcesses() {
  for (const processInfo of startedProcesses.reverse()) {
    if (processInfo.browser) {
      await stopCdpBrowser(processInfo.browser);
      continue;
    }

    const { child } = processInfo;
    if (child.exitCode !== null) continue;
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        killer.on("exit", resolve);
        killer.on("error", resolve);
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

async function writeReport(pass, error) {
  const report = {
    pass,
    capturedAt: new Date().toISOString(),
    webUrl: WEB_URL,
    previewUrl: PREVIEW_URL,
    localServerUrl: LOCAL_SERVER_URL,
    expectedBuildCommit: EXPECT_BUILD_COMMIT,
    liveOnline: RUN_LIVE_ONLINE,
    liveOnlineModes: RUN_LIVE_ONLINE_MODES,
    liveWeb: RUN_LIVE_WEB,
    liveVersion: RUN_LIVE_VERSION,
    mobilePerf: RUN_MOBILE_PERF,
    sharedCdp: USE_SHARED_CDP ? { port: SHARED_CDP_PORT } : { enabled: false },
    steps,
    startedProcesses: startedProcesses.map(({ args, cwd, output }) => ({ args, cwd, output: output.slice(-20) })),
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  };
  await mkdir("outputs", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  return report;
}

async function run() {
  let failure;
  try {
    await step("web:test", () => npmRun("test"));
    await step("web:typecheck", () => npmRun("typecheck"));
    await step("web:lint", () => npmRun("lint"));
    await step("web:audit", () => runProcess(npmCmd, ["audit"], { cwd: ROOT }));
    await step("web:build", () => npmRun("build"));
    await step("web:metadata-smoke", () => npmRun("metadata:smoke", {
      METADATA_INDEX: "dist/index.html",
      METADATA_PUBLIC_ROOT: "dist",
      METADATA_OUTPUT: "outputs/metadata-smoke-dist.json",
    }));
    await step("web:assets-smoke", () => npmRun("assets:smoke"));
    await step("server:build", () => serverNpm(["run", "build"]));
    await step("server:audit", () => serverNpm(["audit"]));
    await step("ensure:web", ensureWebServer);
    await step("ensure:preview", ensurePreviewServer);
    await step("ensure:local-server", ensureLocalGameServer);
    await step("ensure:shared-browser", ensureSharedBrowser);
    await step("smoke:a11y", () => npmRun("a11y:smoke", browserSmokeEnv({ A11Y_URL: WEB_URL })));
    await step("smoke:preview", () => npmRun("preview:smoke", browserSmokeEnv({
      PREVIEW_URL,
      PREVIEW_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
    })));
    await step("smoke:modes", () => npmRun("modes:smoke", browserSmokeEnv({ MODES_URL: PREVIEW_URL })));
    await step("smoke:perf", () => npmRun("perf:smoke", browserSmokeEnv({ PERF_URL: PREVIEW_URL })));
    if (RUN_MOBILE_PERF) {
      await step("smoke:mobile-perf", () => npmRun("perf:mobile:smoke", browserSmokeEnv({ MOBILE_PERF_URL: PREVIEW_URL })));
    }
    await step("smoke:soak", () => npmRun("soak:smoke", browserSmokeEnv({ SOAK_URL: PREVIEW_URL })));
    await step("smoke:online-local", () => npmRun("online:smoke", {
      ONLINE_SERVER_URL: LOCAL_SERVER_URL,
      ONLINE_OUTPUT: "outputs/online-smoke-local.json",
      ONLINE_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
    }));
    await step("smoke:online-modes-local", () => npmRun("online:modes:smoke", {
      ONLINE_MODES_SERVER_URL: LOCAL_SERVER_URL,
      ONLINE_MODES_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
    }));
    await step("smoke:online-disconnect-local", () => npmRun("online:disconnect:smoke", {
      ONLINE_DISCONNECT_SERVER_URL: LOCAL_SERVER_URL,
      ONLINE_DISCONNECT_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
    }));
    if (RUN_LIVE_ONLINE) {
      await step("smoke:online-live", () => npmRun("online:smoke", RUN_LIVE_VERSION ? {
        ONLINE_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
      } : {}));
    }
    if (RUN_LIVE_ONLINE_MODES) {
      await step("smoke:online-modes-live", () => npmRun("live:online:modes", RUN_LIVE_VERSION ? {
        ONLINE_MODES_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
      } : {}));
    }
    if (RUN_LIVE_WEB) {
      await step("smoke:web-live", () => npmRun("live:smoke", browserSmokeEnv(RUN_LIVE_VERSION ? {
        PREVIEW_EXPECT_BUILD_COMMIT: EXPECT_BUILD_COMMIT,
      } : {})));
    }
  } catch (error) {
    failure = error;
  } finally {
    await stopStartedProcesses();
  }

  const report = await writeReport(!failure, failure);
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    steps: report.steps.map((item) => ({ name: item.name, pass: item.pass, elapsedMs: item.elapsedMs })),
    output: OUTPUT,
    error: report.error,
  }, null, 2));

  if (failure) process.exit(1);
}

run().catch(async (error) => {
  await stopStartedProcesses();
  await writeReport(false, error);
  console.error(error.stack || error.message || error);
  process.exit(1);
});
