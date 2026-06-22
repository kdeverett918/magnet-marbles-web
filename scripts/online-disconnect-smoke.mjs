import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_ENDPOINT = "ws://127.0.0.1:2568";
const ENDPOINT = normalizeEndpoint(
  process.env.ONLINE_DISCONNECT_SERVER_URL ||
  process.env.ONLINE_SERVER_URL ||
  DEFAULT_ENDPOINT
);
const MODE = process.env.ONLINE_DISCONNECT_MODE || "classic";
const HEALTH_TIMEOUT_MS = Number(process.env.ONLINE_DISCONNECT_HEALTH_TIMEOUT_MS || 20_000);
const HEALTH_POLL_MS = Number(process.env.ONLINE_DISCONNECT_HEALTH_POLL_MS || 500);
const JOIN_TIMEOUT_MS = Number(process.env.ONLINE_DISCONNECT_JOIN_TIMEOUT_MS || 15_000);
const SNAP_TIMEOUT_MS = Number(process.env.ONLINE_DISCONNECT_SNAP_TIMEOUT_MS || 8_000);
const OUTPUT = process.env.ONLINE_DISCONNECT_OUTPUT || "outputs/online-disconnect-smoke.json";
const EXPECT_BUILD_COMMIT = process.env.ONLINE_DISCONNECT_EXPECT_BUILD_COMMIT || "";
const EXPECT_BUILD_SOURCE_FINGERPRINT = process.env.ONLINE_DISCONNECT_EXPECT_BUILD_SOURCE_FINGERPRINT || "";

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

function keepSnapshotHandler(room) {
  room.onMessage("snap", () => {
    /* keep Colyseus quiet while this smoke waits on snapshots from other seats */
  });
}

function waitForSnapshot(room, predicate, label, ms = SNAP_TIMEOUT_MS) {
  return withTimeout(new Promise((resolve, reject) => {
    const off = room.onMessage("snap", (snapshot) => {
      try {
        if (!predicate || predicate(snapshot)) {
          if (typeof off === "function") off();
          resolve(snapshot);
        }
      } catch (error) {
        if (typeof off === "function") off();
        reject(error);
      }
    });
  }), ms, label);
}

async function leaveRoom(room, label) {
  if (!room) return;
  try {
    room.onError?.clear?.();
    if (room.connection?.events) room.connection.events.onerror = () => {};
    if (room.connection?.transport?.ws) room.connection.transport.ws.onerror = () => {};
    await withTimeout(room.leave(true), 2_000, `${label} leave`);
  } catch {
    /* ignore room shutdown races */
  }
}

function summarizeSeat(snapshot, id) {
  const player = snapshot?.players?.find((item) => item.id === id);
  if (!player) return null;
  return {
    id: player.id,
    bot: player.bot,
    magnetActive: player.mag,
    score: player.s,
    cluster: player.cl,
    alive: player.al,
  };
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for online disconnect smoke.");
  }

  const startedAt = performance.now();
  let roomA;
  let roomB;
  let roomC;

  try {
    const health = await waitForHealth(ENDPOINT);
    if (EXPECT_BUILD_COMMIT && !String(health.build?.commit || "").startsWith(EXPECT_BUILD_COMMIT)) {
      throw new Error(`Server build commit ${health.build?.commit || "missing"} did not match expected ${EXPECT_BUILD_COMMIT}`);
    }
    if (EXPECT_BUILD_SOURCE_FINGERPRINT && health.build?.sourceFingerprint !== EXPECT_BUILD_SOURCE_FINGERPRINT) {
      throw new Error(`Server source fingerprint ${health.build?.sourceFingerprint || "missing"} did not match expected ${EXPECT_BUILD_SOURCE_FINGERPRINT}`);
    }

    const { Client } = await import("colyseus.js");
    const clientA = new Client(ENDPOINT);
    const clientB = new Client(ENDPOINT);
    const clientC = new Client(ENDPOINT);

    const joinAStartedAt = performance.now();
    roomA = await withTimeout(clientA.joinOrCreate("arena", { mode: MODE }), JOIN_TIMEOUT_MS, "first joinOrCreate");
    keepSnapshotHandler(roomA);
    const welcomeA = await waitForMessage(roomA, "welcome", SNAP_TIMEOUT_MS);
    const firstSnapshot = await waitForMessage(roomA, "snap", SNAP_TIMEOUT_MS);
    const abandonedId = welcomeA.id;

    const joinBStartedAt = performance.now();
    roomB = await withTimeout(clientB.joinById(roomA.roomId, { mode: MODE }), JOIN_TIMEOUT_MS, "second joinById");
    keepSnapshotHandler(roomB);
    const welcomeB = await waitForMessage(roomB, "welcome", SNAP_TIMEOUT_MS);
    const observerId = welcomeB.id;
    if (observerId === abandonedId) throw new Error("Observer was assigned the same seat as the first client");

    roomA.send("input", { moveX: 1, moveZ: 0, magnet: true, dash: true, activate: false });
    const humanSnapshot = await waitForSnapshot(
      roomB,
      (snapshot) => snapshot.players?.some((player) => player.id === abandonedId && player.bot === false),
      "human seat snapshot",
    );

    await leaveRoom(roomA, "first room");
    roomA = null;

    const takeoverSnapshot = await waitForSnapshot(
      roomB,
      (snapshot) => snapshot.players?.some((player) => (
        player.id === abandonedId &&
        player.bot === true &&
        player.mag === false
      )),
      "bot takeover snapshot",
    );

    const joinCStartedAt = performance.now();
    roomC = await withTimeout(clientC.joinById(roomB.roomId, { mode: MODE }), JOIN_TIMEOUT_MS, "replacement joinById");
    keepSnapshotHandler(roomC);
    const welcomeC = await waitForMessage(roomC, "welcome", SNAP_TIMEOUT_MS);
    const replacementId = welcomeC.id;
    if (replacementId !== abandonedId) {
      throw new Error(`Replacement client should reclaim abandoned seat ${abandonedId}, got ${replacementId}`);
    }

    const replacementSnapshot = await waitForSnapshot(
      roomB,
      (snapshot) => snapshot.players?.some((player) => player.id === replacementId && player.bot === false),
      "replacement human snapshot",
    );

    const report = {
      endpoint: ENDPOINT,
      mode: MODE,
      pass: true,
      capturedAt: new Date().toISOString(),
      health,
      roomId: roomB.roomId,
      joins: {
        firstMs: Math.round(performance.now() - joinAStartedAt),
        observerMs: Math.round(performance.now() - joinBStartedAt),
        replacementMs: Math.round(performance.now() - joinCStartedAt),
      },
      seats: {
        abandonedId,
        observerId,
        replacementId,
        initial: summarizeSeat(firstSnapshot, abandonedId),
        beforeLeave: summarizeSeat(humanSnapshot, abandonedId),
        afterLeave: summarizeSeat(takeoverSnapshot, abandonedId),
        replacement: summarizeSeat(replacementSnapshot, replacementId),
      },
      totalElapsedMs: Math.round(performance.now() - startedAt),
    };

    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await leaveRoom(roomC, "replacement room");
    await leaveRoom(roomB, "observer room");
    await leaveRoom(roomA, "first room");
  }
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
  process.exitCode = 1;
});
