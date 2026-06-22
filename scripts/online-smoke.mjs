import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Client } from "colyseus.js";

const DEFAULT_ENDPOINT = "wss://magnet-marbles-server.onrender.com";
const ENDPOINT = normalizeEndpoint(process.env.ONLINE_SERVER_URL || process.env.VITE_SERVER_URL || DEFAULT_ENDPOINT);
const MODE = process.env.ONLINE_MODE || "classic";
const HEALTH_TIMEOUT_MS = Number(process.env.ONLINE_HEALTH_TIMEOUT_MS || 60_000);
const HEALTH_POLL_MS = Number(process.env.ONLINE_HEALTH_POLL_MS || 1_000);
const JOIN_TIMEOUT_MS = Number(process.env.ONLINE_JOIN_TIMEOUT_MS || 60_000);
const SNAP_TIMEOUT_MS = Number(process.env.ONLINE_SNAP_TIMEOUT_MS || 10_000);
const OUTPUT = process.env.ONLINE_OUTPUT || "outputs/online-smoke.json";
const EXPECT_BUILD_COMMIT = process.env.ONLINE_EXPECT_BUILD_COMMIT || "";

function normalizeEndpoint(raw) {
  const url = new URL(raw);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds`)), ms);
    }),
  ]);
}

async function waitForHealth(endpoint) {
  const healthUrl = healthUrlForEndpoint(endpoint);
  const startedAt = performance.now();
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const attempts = [];

  while (Date.now() <= deadline) {
    const attemptStartedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    try {
      const response = await fetch(healthUrl, { cache: "no-store", signal: controller.signal });
      const elapsedMs = Math.round(performance.now() - attemptStartedAt);
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 120);
      }
      attempts.push({ status: response.status, ok: response.ok, elapsedMs, body });
      if (response.ok || response.status === 404 || response.status === 405) {
        return {
          url: healthUrl,
          ok: true,
          elapsedMs: Math.round(performance.now() - startedAt),
          build: body?.build ?? null,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({
        ok: false,
        elapsedMs: Math.round(performance.now() - attemptStartedAt),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }

    const wait = Math.min(HEALTH_POLL_MS, Math.max(0, deadline - Date.now()));
    if (wait > 0) await delay(wait);
  }

  throw new Error(`Health check did not pass within ${Math.round(HEALTH_TIMEOUT_MS / 1000)} seconds`);
}

function waitForMessage(room, type, ms) {
  return withTimeout(new Promise((resolve) => {
    const off = room.onMessage(type, (message) => {
      if (typeof off === "function") off();
      resolve(message);
    });
  }), ms, `${type} message`);
}

function summarizeSnapshot(snapshot) {
  return {
    phase: snapshot?.phase,
    round: snapshot?.round,
    rounds: snapshot?.rounds,
    roundTime: snapshot?.roundTime,
    suddenDeath: snapshot?.sd,
    winnerId: snapshot?.win,
    players: Array.isArray(snapshot?.players) ? snapshot.players.length : 0,
    marbles: Array.isArray(snapshot?.marbles) ? snapshot.marbles.length : 0,
    pickups: Array.isArray(snapshot?.pickups) ? snapshot.pickups.length : 0,
    buttons: Array.isArray(snapshot?.buttons) ? snapshot.buttons.length : 0,
    rings: Array.isArray(snapshot?.rings) ? snapshot.rings.length : 0,
  };
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for online smoke.");
  }

  const startedAt = performance.now();
  let room;
  let report;

  try {
    const health = await waitForHealth(ENDPOINT);
    if (EXPECT_BUILD_COMMIT && !String(health.build?.commit || "").startsWith(EXPECT_BUILD_COMMIT)) {
      throw new Error(`Server build commit ${health.build?.commit || "missing"} did not match expected ${EXPECT_BUILD_COMMIT}`);
    }
    const client = new Client(ENDPOINT);
    const joinStartedAt = performance.now();
    room = await withTimeout(client.joinOrCreate("arena", { mode: MODE }), JOIN_TIMEOUT_MS, "joinOrCreate");
    const joinedAt = performance.now();

    const snapPromise = waitForMessage(room, "snap", SNAP_TIMEOUT_MS);
    const welcomePromise = waitForMessage(room, "welcome", SNAP_TIMEOUT_MS).catch(() => null);
    const snapshot = await snapPromise;
    const welcome = await Promise.race([welcomePromise, delay(500).then(() => null)]);

    report = {
      endpoint: ENDPOINT,
      mode: MODE,
      pass: true,
      capturedAt: new Date().toISOString(),
      health,
      join: {
        roomId: room.roomId,
        sessionId: room.sessionId,
        elapsedMs: Math.round(joinedAt - joinStartedAt),
        firstSnapshotMs: Math.round(performance.now() - joinStartedAt),
        welcome: welcome ?? null,
        snapshot: summarizeSnapshot(snapshot),
      },
      totalElapsedMs: Math.round(performance.now() - startedAt),
    };

    if (report.join.snapshot.players < 2) throw new Error(`Unexpected player count: ${report.join.snapshot.players}`);
    if (report.join.snapshot.marbles < 1) throw new Error("Snapshot did not include marbles");
  } finally {
    if (room) {
      try {
        room.onError?.clear?.();
        if (room.connection?.events) room.connection.events.onerror = () => {};
        if (room.connection?.transport?.ws) room.connection.transport.ws.onerror = () => {};
        await withTimeout(room.leave(true), 2_000, "room leave");
      } catch {
        /* ignore room shutdown races */
      }
    }
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    endpoint: ENDPOINT,
    mode: MODE,
    pass: false,
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  } catch {
    /* ignore report write failures while exiting */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
