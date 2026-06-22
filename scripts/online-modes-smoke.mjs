import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

let Client;

async function loadColyseusClient() {
  if (!Client) {
    ({ Client } = await import("colyseus.js"));
  }
  return Client;
}

const DEFAULT_ENDPOINT = "ws://127.0.0.1:2568";
const ENDPOINT = normalizeEndpoint(
  process.env.ONLINE_MODES_SERVER_URL ||
  process.env.ONLINE_SERVER_URL ||
  DEFAULT_ENDPOINT
);
const HEALTH_TIMEOUT_MS = Number(process.env.ONLINE_MODES_HEALTH_TIMEOUT_MS || 20_000);
const HEALTH_POLL_MS = Number(process.env.ONLINE_MODES_HEALTH_POLL_MS || 500);
const JOIN_TIMEOUT_MS = Number(process.env.ONLINE_MODES_JOIN_TIMEOUT_MS || 15_000);
const SNAP_TIMEOUT_MS = Number(process.env.ONLINE_MODES_SNAP_TIMEOUT_MS || 8_000);
const OUTPUT = process.env.ONLINE_MODES_OUTPUT || "outputs/online-modes-smoke.json";
const EXPECT_BUILD_COMMIT = process.env.ONLINE_MODES_EXPECT_BUILD_COMMIT || "";
const EXPECT_BUILD_SOURCE_FINGERPRINT = process.env.ONLINE_MODES_EXPECT_BUILD_SOURCE_FINGERPRINT || "";

const modes = [
  { id: "classic", rounds: 3, roundTime: 90 },
  { id: "battle", rounds: 3, roundTime: 90 },
  { id: "king-magnet", rounds: 1, roundTime: 90 },
  { id: "team-bank", rounds: 3, roundTime: 90, teamIds: [0, 1, 0, 1] },
  { id: "survival", rounds: 1, roundTime: 90, lives: 3 },
];

const expectedPowerups = new Set(["magnetBurst", "shockPulse", "heavyCore"]);

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

function shouldSuppressExpectedMismatchLog(args) {
  const text = args.map((arg) => String(arg)).join(" ");
  return (
    text.includes("Room mode mismatch") ||
    text.includes("Room connection was closed unexpectedly (4002)") ||
    text.includes("colyseus.js - onError => (4002)") ||
    text.includes("colyseus.js - onError => (4216)")
  );
}

async function expectJoinByIdRejected(client, roomId, options, label) {
  const originalWarn = console.warn;
  const originalError = console.error;
  let room;
  console.warn = (...args) => {
    if (!shouldSuppressExpectedMismatchLog(args)) originalWarn(...args);
  };
  console.error = (...args) => {
    if (!shouldSuppressExpectedMismatchLog(args)) originalError(...args);
  };
  try {
    room = await withTimeout(client.joinById(roomId, options), JOIN_TIMEOUT_MS, label);
    return { rejected: false, error: "", room };
  } catch (error) {
    await delay(50);
    return {
      rejected: true,
      error: error instanceof Error ? error.message : String(error),
      room: null,
    };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
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
    mode: snapshot?.mode,
    phase: snapshot?.phase,
    round: snapshot?.round,
    rounds: snapshot?.rounds,
    roundTime: snapshot?.roundTime,
    suddenDeath: snapshot?.sd,
    winnerId: snapshot?.win,
    players: Array.isArray(snapshot?.players) ? snapshot.players.length : 0,
    playerTeams: Array.isArray(snapshot?.players) ? snapshot.players.map((p) => p.tm) : [],
    playerLives: Array.isArray(snapshot?.players) ? snapshot.players.map((p) => p.lv) : [],
    marbles: Array.isArray(snapshot?.marbles) ? snapshot.marbles.length : 0,
    pickups: Array.isArray(snapshot?.pickups) ? snapshot.pickups.length : 0,
    pickupTypes: Array.isArray(snapshot?.pickups) ? snapshot.pickups.map((p) => p.t) : [],
    buttons: Array.isArray(snapshot?.buttons) ? snapshot.buttons.length : 0,
    rings: Array.isArray(snapshot?.rings) ? snapshot.rings.length : 0,
  };
}

function assertModeSnapshot(mode, snapshot) {
  const summary = summarizeSnapshot(snapshot);
  if (summary.mode !== mode.id) throw new Error(`${mode.id}: server snapshot mode '${summary.mode}' did not match request`);
  if (summary.rounds !== mode.rounds) throw new Error(`${mode.id}: expected ${mode.rounds} rounds, got ${summary.rounds}`);
  if (Math.round(summary.roundTime) !== mode.roundTime) {
    throw new Error(`${mode.id}: expected roundTime ${mode.roundTime}, got ${summary.roundTime}`);
  }
  if (summary.players !== 4) throw new Error(`${mode.id}: expected 4 players, got ${summary.players}`);
  if (summary.marbles < 1) throw new Error(`${mode.id}: snapshot did not include marbles`);
  if (summary.pickups < 1) throw new Error(`${mode.id}: snapshot did not include powerups`);
  const unexpectedPowerup = summary.pickupTypes.find((type) => !expectedPowerups.has(type));
  if (unexpectedPowerup) throw new Error(`${mode.id}: unexpected pickup type '${unexpectedPowerup}'`);
  if (mode.teamIds && JSON.stringify(summary.playerTeams) !== JSON.stringify(mode.teamIds)) {
    throw new Error(`${mode.id}: expected team ids ${mode.teamIds.join(",")}, got ${summary.playerTeams.join(",")}`);
  }
  if (mode.lives && !summary.playerLives.every((lives) => lives === mode.lives)) {
    throw new Error(`${mode.id}: expected all players to start with ${mode.lives} lives, got ${summary.playerLives.join(",")}`);
  }
  return summary;
}

async function smokeMode(client, mode) {
  const joinStartedAt = performance.now();
  let room;
  try {
    room = await withTimeout(client.joinOrCreate("arena", { mode: mode.id }), JOIN_TIMEOUT_MS, `${mode.id} joinOrCreate`);
    const joinedAt = performance.now();
    const snapPromise = waitForMessage(room, "snap", SNAP_TIMEOUT_MS);
    const welcomePromise = waitForMessage(room, "welcome", SNAP_TIMEOUT_MS).catch(() => null);
    const snapshot = await snapPromise;
    const welcome = await Promise.race([welcomePromise, delay(500).then(() => null)]);
    const summary = assertModeSnapshot(mode, snapshot);
    return {
      mode: mode.id,
      pass: true,
      roomId: room.roomId,
      sessionId: room.sessionId,
      elapsedMs: Math.round(joinedAt - joinStartedAt),
      firstSnapshotMs: Math.round(performance.now() - joinStartedAt),
      welcome: welcome ?? null,
      snapshot: summary,
    };
  } finally {
    if (room) {
      try {
        room.onError?.clear?.();
        if (room.connection?.events) room.connection.events.onerror = () => {};
        if (room.connection?.transport?.ws) room.connection.transport.ws.onerror = () => {};
        await withTimeout(room.leave(true), 2_000, `${mode.id} room leave`);
      } catch {
        /* ignore room shutdown races */
      }
    }
  }
}

async function smokeModeIsolation() {
  const ClientClass = await loadColyseusClient();
  const classic = modes.find((mode) => mode.id === "classic");
  const survival = modes.find((mode) => mode.id === "survival");
  if (!classic || !survival) throw new Error("mode isolation smoke requires classic and survival definitions");

  const clientA = new ClientClass(ENDPOINT);
  const clientB = new ClientClass(ENDPOINT);
  const clientMismatch = new ClientClass(ENDPOINT);
  let classicRoom;
  let survivalRoom;
  let mismatchedRoom;
  const startedAt = performance.now();

  try {
    classicRoom = await withTimeout(clientA.joinOrCreate("arena", { mode: classic.id }), JOIN_TIMEOUT_MS, "mode isolation classic join");
    classicRoom.onMessage("welcome", () => {});
    const classicSnapshot = await waitForMessage(classicRoom, "snap", SNAP_TIMEOUT_MS);
    const classicSummary = assertModeSnapshot(classic, classicSnapshot);

    const mismatch = await expectJoinByIdRejected(
      clientMismatch,
      classicRoom.roomId,
      { mode: survival.id },
      "mode isolation mismatched joinById"
    );
    mismatchedRoom = mismatch.room;
    if (!mismatch.rejected) {
      throw new Error("mode isolation failed: mismatched joinById unexpectedly joined the Classic room");
    }

    survivalRoom = await withTimeout(clientB.joinOrCreate("arena", { mode: survival.id }), JOIN_TIMEOUT_MS, "mode isolation survival join");
    survivalRoom.onMessage("welcome", () => {});
    const survivalSnapshot = await waitForMessage(survivalRoom, "snap", SNAP_TIMEOUT_MS);
    const survivalSummary = assertModeSnapshot(survival, survivalSnapshot);

    if (survivalRoom.roomId === classicRoom.roomId) {
      throw new Error("mode isolation failed: survival joined the occupied classic room");
    }

    return {
      pass: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      classicRoomId: classicRoom.roomId,
      survivalRoomId: survivalRoom.roomId,
      mismatchedJoinRejected: true,
      mismatchedJoinError: mismatch.error,
      classicSnapshot: classicSummary,
      survivalSnapshot: survivalSummary,
    };
  } finally {
    for (const room of [mismatchedRoom, survivalRoom, classicRoom]) {
      if (!room) continue;
      try {
        room.onError?.clear?.();
        if (room.connection?.events) room.connection.events.onerror = () => {};
        if (room.connection?.transport?.ws) room.connection.transport.ws.onerror = () => {};
        await withTimeout(room.leave(true), 2_000, "mode isolation room leave");
      } catch {
        /* ignore room shutdown races */
      }
    }
  }
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for online modes smoke.");
  }

  const startedAt = performance.now();
  const health = await waitForHealth(ENDPOINT);
  if (EXPECT_BUILD_COMMIT && !String(health.build?.commit || "").startsWith(EXPECT_BUILD_COMMIT)) {
    throw new Error(`Server build commit ${health.build?.commit || "missing"} did not match expected ${EXPECT_BUILD_COMMIT}`);
  }
  if (EXPECT_BUILD_SOURCE_FINGERPRINT && health.build?.sourceFingerprint !== EXPECT_BUILD_SOURCE_FINGERPRINT) {
    throw new Error(`Server source fingerprint ${health.build?.sourceFingerprint || "missing"} did not match expected ${EXPECT_BUILD_SOURCE_FINGERPRINT}`);
  }
  const modeIsolation = await smokeModeIsolation();
  const ClientClass = await loadColyseusClient();
  const client = new ClientClass(ENDPOINT);
  const results = [];
  for (const mode of modes) {
    results.push(await smokeMode(client, mode));
  }

  const report = {
    endpoint: ENDPOINT,
    pass: true,
    capturedAt: new Date().toISOString(),
    health,
    modeIsolation,
    modes: results,
    totalElapsedMs: Math.round(performance.now() - startedAt),
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    endpoint: ENDPOINT,
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
