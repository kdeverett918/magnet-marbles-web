import { Client, Room } from "colyseus.js";
import { NetView } from "./NetView";
import type { Snapshot } from "./protocol";

export interface NetSession {
  room: Room;
  view: NetView;
  roomId: string;
}

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

/** Connect to the Colyseus arena. quick-match or join by room code. */
export async function connect(opts: JoinOpts): Promise<NetSession> {
  const client = new Client(endpoint());
  const options = { mode: opts.mode };

  let room: Room;
  if (opts.roomCode) {
    room = await client.joinById(opts.roomCode, options);
  } else {
    room = await client.joinOrCreate("arena", options);
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
