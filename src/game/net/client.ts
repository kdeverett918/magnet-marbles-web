import { Client, Room } from "colyseus.js";
import { NetView } from "./NetView";
import type { Snapshot } from "./protocol";

export interface NetSession {
  room: Room;
  view: NetView;
  roomId: string;
}

type HealthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, "ok" | "status">>;

export const ONLINE_JOIN_TIMEOUT_MS = 60_000;
export const ONLINE_HEALTH_TIMEOUT_MS = 55_000;
export const ONLINE_HEALTH_POLL_MS = 1_000;

function endpoint(): string {
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  // dev fallback: same host, Colyseus default port
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.hostname}:2567`;
}

export interface JoinOpts {
  mode: string;
  roomCode?: string; // join a specific private room by id; else quick-match
}

export function healthUrlForEndpoint(serverEndpoint: string): string {
  const base = typeof location === "undefined" ? "http://127.0.0.1/" : location.href;
  const url = new URL(serverEndpoint, base);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function waitForServerHealth(
  serverEndpoint: string,
  opts: { timeoutMs?: number; pollMs?: number; fetchImpl?: HealthFetch } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? ONLINE_HEALTH_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? ONLINE_HEALTH_POLL_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const healthUrl = healthUrlForEndpoint(serverEndpoint);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() <= deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), remaining);
    try {
      const response = await fetchImpl(healthUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) return;
      if (response.status === 404 || response.status === 405) return;
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || "health check failed");
    } finally {
      globalThis.clearTimeout(timer);
    }

    const wait = Math.min(pollMs, Math.max(0, deadline - Date.now()));
    if (wait > 0) await sleep(wait);
  }

  throw new Error(
    `Online server did not wake after ${Math.round(timeoutMs / 1000)} seconds. Retry in a moment.${lastError ? ` (${lastError})` : ""}`,
  );
}

export function formatJoinError(error: unknown, hasRoomCode: boolean): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (!message || message === "[object ProgressEvent]") {
    return "Online server is waking or unreachable. Wait a moment, then retry.";
  }
  if (normalized.includes("timed out")) return message;
  if (hasRoomCode && (normalized.includes("not found") || normalized.includes("no available"))) {
    return "Room not found. Check the code and retry.";
  }
  if (
    normalized.includes("socket hang up") ||
    normalized.includes("network") ||
    normalized.includes("failed") ||
    normalized.includes("timeout") ||
    normalized.includes("websocket")
  ) {
    return "Online server is waking or unreachable. Wait a moment, then retry.";
  }

  return message || "Could not connect to online server.";
}

function waitForJoin(join: Promise<Room>): Promise<Room> {
  let timedOut = false;

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      reject(new Error("Online server did not respond after 60 seconds. Retry in a moment."));
    }, ONLINE_JOIN_TIMEOUT_MS);

    join.then(
      (room) => {
        globalThis.clearTimeout(timeout);
        if (timedOut) {
          try {
            room.leave();
          } catch {
            /* late reservation after timeout */
          }
          return;
        }
        resolve(room);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        if (!timedOut) reject(error);
      },
    );
  });
}

/** Connect to the Colyseus arena. quick-match or join by room code. */
export async function connect(opts: JoinOpts): Promise<NetSession> {
  const serverEndpoint = endpoint();
  const client = new Client(serverEndpoint);
  const options = { mode: opts.mode };

  let room: Room;
  try {
    await waitForServerHealth(serverEndpoint);
    const join = opts.roomCode
      ? client.joinById(opts.roomCode, options)
      : client.joinOrCreate("arena", options);
    room = await waitForJoin(join);
  } catch (error) {
    throw new Error(formatJoinError(error, Boolean(opts.roomCode)));
  }

  const view = new NetView((type, data) => {
    try {
      room.send(type, data);
    } catch {
      /* room closing */
    }
  });

  room.onMessage("welcome", (d: { id: number }) => {
    view.humanId = d.id;
  });
  room.onMessage<Snapshot>("snap", (s) => view.applySnapshot(s));

  return { room, view, roomId: room.roomId };
}
