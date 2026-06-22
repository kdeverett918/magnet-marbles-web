import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const ROOT = process.cwd();
const SERVER_DIR = `${ROOT}/server`;
const OUTPUT = process.env.NO_BROWSER_OUTPUT || "outputs/no-browser-check.json";
const npmCmd = "npm";
const preferredOnlinePort = Number(process.env.NO_BROWSER_ONLINE_PORT || 2568);
const expectedSourceFingerprint = fingerprintModule.sourceFingerprintSync();
const steps = [];
const startedProcesses = [];

function commandOutput(command, args, fallback) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
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
      const result = {
        code,
        elapsedMs: Math.round(performance.now() - startedAt),
        stdout: stdout.trim().slice(-12_000),
        stderr: stderr.trim().slice(-12_000),
      };
      if (code === 0) resolve(result);
      else {
        const error = new Error(`${command} ${args.join(" ")} exited ${code}`);
        error.result = result;
        reject(error);
      }
    });
  });
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

function npmRun(name, env = {}) {
  return runProcess(npmCmd, ["run", name], { cwd: ROOT, env });
}

function npmRoot(args, env = {}) {
  return runProcess(npmCmd, args, { cwd: ROOT, env });
}

function npmServer(args, env = {}) {
  return runProcess(npmCmd, args, { cwd: SERVER_DIR, env });
}

function startProcess(command, args, opts = {}) {
  const child = spawnCrossPlatform(command, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString().trim()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString().trim()));
  child.on("exit", (code) => output.push(`process exited ${code}`));
  startedProcesses.push({ child, args, cwd: opts.cwd || ROOT, output });
  return child;
}

async function stopStartedProcesses() {
  for (const processInfo of startedProcesses.reverse()) {
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

function findFreePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", (error) => {
      if (error.code !== "EADDRINUSE") {
        reject(error);
        return;
      }
      const fallback = createNetServer();
      fallback.once("error", reject);
      fallback.listen(0, "127.0.0.1", () => {
        const address = fallback.address();
        fallback.close(() => resolve(address.port));
      });
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
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

async function waitForHealth(endpoint, expectedCommit, expectedFingerprint, timeoutMs = 20_000) {
  const healthUrl = healthUrlForEndpoint(endpoint);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      const body = await response.json();
      const commitMatches = !expectedCommit || String(body.build?.commit || "").startsWith(expectedCommit);
      const fingerprintMatches = !expectedFingerprint || body.build?.sourceFingerprint === expectedFingerprint;
      if (response.ok && body?.ok && commitMatches && fingerprintMatches) {
        return { endpoint, healthUrl, build: body.build ?? null };
      }
      lastError = `status ${response.status}, commit ${body?.build?.commit || "missing"}, source ${body?.build?.sourceFingerprint || "missing"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`local online server did not become healthy at ${healthUrl}: ${lastError}`);
}

async function ensureLocalOnlineServer() {
  const port = await findFreePort(preferredOnlinePort);
  const endpoint = `ws://127.0.0.1:${port}`;
  const commit = commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "no-browser-local");
  const branch = commandOutput("git", ["branch", "--show-current"], "unknown");
  startProcess("node", ["dist/index.js"], {
    cwd: SERVER_DIR,
    env: {
      PORT: String(port),
      GIT_COMMIT: commit,
      GIT_BRANCH: branch,
      BUILD_TIME: new Date().toISOString(),
      SOURCE_FINGERPRINT: expectedSourceFingerprint,
    },
  });
  return waitForHealth(endpoint, commit, expectedSourceFingerprint);
}

async function writeReport(pass, error) {
  const report = {
    pass,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
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
  let onlineServer;
  try {
    await step("web:test", () => npmRun("test"));
    await step("web:vertical-slice", () => npmRun("vertical:slice"));
    await step("web:lint", () => npmRun("lint"));
    await step("web:audit", () => npmRoot(["audit"]));
    await step("web:build", () => npmRun("build"));
    await step("web:build-info-smoke", () => npmRun("build-info:smoke", {
      BUILD_INFO_OUTPUT: "outputs/build-info-smoke-no-browser.json",
    }));
    await step("web:source-fingerprint-smoke", () => npmRun("source:fingerprint", {
      SOURCE_FINGERPRINT_OUTPUT: "outputs/source-fingerprint-smoke-no-browser.json",
    }));
    await step("web:metadata-smoke-dist", () => npmRun("metadata:smoke", {
      METADATA_INDEX: "dist/index.html",
      METADATA_PUBLIC_ROOT: "dist",
      METADATA_OUTPUT: "outputs/metadata-smoke-dist-no-browser.json",
    }));
    await step("web:ip-safety-smoke", () => npmRun("ip:safety", {
      IP_SAFETY_OUTPUT: "outputs/ip-safety-smoke-no-browser.json",
    }));
    await step("web:dist-budget-smoke", () => npmRun("dist:budget", {
      DIST_BUDGET_OUTPUT: "outputs/dist-budget-smoke-no-browser.json",
    }));
    await step("web:assets-smoke", () => npmRun("assets:smoke", {
      ASSETS_OUTPUT: "outputs/assets-smoke-no-browser.json",
    }));
    await step("web:aa-readiness-smoke", () => npmRun("aa:readiness", {
      AA_READINESS_OUTPUT: "outputs/aa-readiness-smoke-no-browser.json",
    }));
    await step("web:browser-guard-smoke", () => npmRun("browser:guard"));
    await step("web:clean-exit-smoke", () => npmRun("clean-exit:smoke", {
      CLEAN_EXIT_OUTPUT: "outputs/clean-exit-smoke-no-browser.json",
    }));
    await step("server:build", () => npmServer(["run", "build"]));
    await step("server:audit", () => npmServer(["audit"]));
    await step("ensure:local-online-server", async () => {
      onlineServer = await ensureLocalOnlineServer();
      return onlineServer;
    });
    await step("online:classic-smoke", () => npmRun("online:smoke", {
      ONLINE_SERVER_URL: onlineServer.endpoint,
      ONLINE_OUTPUT: "outputs/online-smoke-no-browser.json",
      ONLINE_EXPECT_BUILD_COMMIT: onlineServer.build?.commit || "",
      ONLINE_EXPECT_BUILD_SOURCE_FINGERPRINT: onlineServer.build?.sourceFingerprint || "",
      ONLINE_HEALTH_TIMEOUT_MS: "20000",
      ONLINE_JOIN_TIMEOUT_MS: "15000",
    }));
    await step("online:modes-smoke", () => npmRun("online:modes:smoke", {
      ONLINE_MODES_SERVER_URL: onlineServer.endpoint,
      ONLINE_MODES_OUTPUT: "outputs/online-modes-smoke-no-browser.json",
      ONLINE_MODES_EXPECT_BUILD_COMMIT: onlineServer.build?.commit || "",
      ONLINE_MODES_EXPECT_BUILD_SOURCE_FINGERPRINT: onlineServer.build?.sourceFingerprint || "",
    }));
    await step("online:disconnect-smoke", () => npmRun("online:disconnect:smoke", {
      ONLINE_DISCONNECT_SERVER_URL: onlineServer.endpoint,
      ONLINE_DISCONNECT_OUTPUT: "outputs/online-disconnect-smoke-no-browser.json",
      ONLINE_DISCONNECT_EXPECT_BUILD_COMMIT: onlineServer.build?.commit || "",
      ONLINE_DISCONNECT_EXPECT_BUILD_SOURCE_FINGERPRINT: onlineServer.build?.sourceFingerprint || "",
    }));
    await step("repo:diff-check", () => runProcess("git", ["diff", "--check"], { cwd: ROOT }));
  } catch (error) {
    failure = error;
  } finally {
    await stopStartedProcesses();
  }

  const report = await writeReport(!failure, failure);
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    browserAutomation: report.browserAutomation,
    steps: report.steps.map((item) => ({ name: item.name, pass: item.pass, elapsedMs: item.elapsedMs })),
    output: OUTPUT,
    error: report.error,
  }, null, 2));

  if (failure) process.exit(1);
}

run().catch(async (error) => {
  await writeReport(false, error);
  console.error(error.stack || error.message || error);
  process.exit(1);
});
