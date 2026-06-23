import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import fingerprintModule from "./lib/source-fingerprint.cjs";

const OUTPUT = process.env.LIVE_VERSION_OUTPUT || "outputs/live-version-smoke.json";
const LIVE_WEB_URL = process.env.LIVE_VERSION_WEB_URL || "https://magnet-marbles.onrender.com/";
const LIVE_SERVER_URL = process.env.LIVE_VERSION_SERVER_URL || "wss://magnet-marbles-server.onrender.com";
const EXPECT_COMMIT = process.env.LIVE_VERSION_EXPECT_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "");
const EXPECT_SOURCE_FINGERPRINT = process.env.LIVE_VERSION_EXPECT_SOURCE_FINGERPRINT || fingerprintModule.sourceFingerprintSync();
const TIMEOUT_MS = Number(process.env.LIVE_VERSION_TIMEOUT_MS || 60_000);
const REQUIRE_MATCH = process.env.LIVE_VERSION_REQUIRE_MATCH !== "0";
const MUSIC_TOMBSTONE_MAX_BYTES = Number(process.env.LIVE_VERSION_MUSIC_TOMBSTONE_MAX_BYTES || 20_000);
const REMOVED_MUSIC_FILENAMES = ["music.mp3", "music.ogg", "music.wav", "music.m4a", "music.aac", "music.flac"];

function commandOutput(command, args, fallback) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
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

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
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
      status: response.status,
      ok: response.ok,
      elapsedMs: Math.round(performance.now() - startedAt),
      body,
      text: body === null ? text.slice(0, 500) : undefined,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStatus(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      method: "HEAD",
      signal: controller.signal,
    });
    return {
      url,
      status: response.status,
      ok: response.ok,
      elapsedMs: Math.round(performance.now() - startedAt),
      contentType: response.headers.get("content-type") || "missing",
      contentLength: response.headers.get("content-length") || "missing",
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function commitMatches(actual) {
  if (!EXPECT_COMMIT) return true;
  return String(actual || "").startsWith(EXPECT_COMMIT);
}

function sourceFingerprintMatches(actual) {
  if (!EXPECT_SOURCE_FINGERPRINT) return true;
  return String(actual || "") === EXPECT_SOURCE_FINGERPRINT;
}

function summarizeBuild(name, result, build) {
  const commit = String(build?.commit || "");
  const sourceFingerprint = String(build?.sourceFingerprint || "");
  const hasBuild = result.ok && build && typeof build === "object";
  const matches = hasBuild && commitMatches(commit);
  const sourceMatches = hasBuild && sourceFingerprintMatches(sourceFingerprint);
  return {
    name,
    pass: hasBuild && (!REQUIRE_MATCH || (matches && sourceMatches)),
    url: result.url,
    status: result.status,
    elapsedMs: result.elapsedMs,
    commit: commit || "missing",
    branch: build?.branch ?? "missing",
    builtAt: build?.builtAt ?? "missing",
    sourceFingerprint: sourceFingerprint || "missing",
    matchesExpectedCommit: matches,
    matchesExpectedSourceFingerprint: sourceMatches,
    error: result.error
      ? `could not fetch build metadata: ${result.error}`
      : hasBuild
      ? REQUIRE_MATCH && !matches
        ? `commit ${commit || "missing"} did not match expected ${EXPECT_COMMIT || "any"}`
        : REQUIRE_MATCH && !sourceMatches
        ? `source fingerprint ${sourceFingerprint || "missing"} did not match expected ${EXPECT_SOURCE_FINGERPRINT || "any"}`
        : undefined
      : `build metadata missing or invalid at ${result.url}`,
  };
}

function summarizeForbiddenMusicResult(result) {
  const missingOrGone = result.status === 404 || result.status === 410;
  const contentLength = Number(result.contentLength);
  const tinyLegacyTombstone = result.status === 200
    && Number.isFinite(contentLength)
    && contentLength > 0
    && contentLength <= MUSIC_TOMBSTONE_MAX_BYTES;
  return {
    pass: missingOrGone || tinyLegacyTombstone,
    url: result.url,
    status: result.status,
    elapsedMs: result.elapsedMs,
    contentType: result.contentType,
    contentLength: result.contentLength,
    maxLegacyTombstoneBytes: MUSIC_TOMBSTONE_MAX_BYTES,
    error: result.error
      ? `could not verify removed music asset: ${result.error}`
      : missingOrGone || tinyLegacyTombstone
      ? undefined
      : `audible background music may still be served at ${result.url}; expected 404/410 or a tiny legacy silent tombstone, got status ${result.status} and ${result.contentLength} bytes`,
  };
}

function summarizeForbiddenMusic(results) {
  const assets = results.map(summarizeForbiddenMusicResult);
  const failing = assets.filter((asset) => !asset.pass);
  return {
    name: "live:forbidden-background-music",
    pass: failing.length === 0,
    url: assets[0]?.url || "missing",
    checkedCount: assets.length,
    extensions: REMOVED_MUSIC_FILENAMES.map((file) => file.split(".").pop()),
    maxLegacyTombstoneBytes: MUSIC_TOMBSTONE_MAX_BYTES,
    assets,
    error: failing.length > 0
      ? failing.map((asset) => asset.error || `${asset.url} failed`).join("; ")
      : undefined,
  };
}

async function run() {
  const webBuildUrl = new URL("./build.json", LIVE_WEB_URL).toString();
  const forbiddenMusicUrls = REMOVED_MUSIC_FILENAMES.map((file) => new URL(`./audio/${file}`, LIVE_WEB_URL).toString());
  const serverHealthUrl = healthUrlForEndpoint(LIVE_SERVER_URL);
  const [webResult, musicResults, serverResult] = await Promise.all([
    fetchJson(webBuildUrl),
    Promise.all(forbiddenMusicUrls.map((url) => fetchStatus(url))),
    fetchJson(serverHealthUrl),
  ]);

  const checks = [
    summarizeBuild("live:web-build-version", webResult, webResult.body),
    summarizeForbiddenMusic(musicResults),
    summarizeBuild("live:server-health-version", serverResult, serverResult.body?.build),
  ];
  const blockers = checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.error}`);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    cdpStarted: false,
    expectedCommit: EXPECT_COMMIT || null,
    expectedSourceFingerprint: EXPECT_SOURCE_FINGERPRINT || null,
    requireMatch: REQUIRE_MATCH,
    endpoints: {
      web: LIVE_WEB_URL,
      webBuild: webBuildUrl,
      forbiddenMusic: forbiddenMusicUrls,
      server: LIVE_SERVER_URL,
      serverHealth: serverHealthUrl,
    },
    checks,
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
    checks,
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
