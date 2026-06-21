import { Room, Client } from "colyseus";
import { World } from "../../src/game/sim/world";
import { MODES } from "../../src/game/data/config";
import { buildSnapshot } from "../../src/game/net/snapshot";
import type { FxEvent } from "../../src/game/data/types";
import type { NetInput } from "../../src/game/net/protocol";

const SIM_HZ = 30;
const SNAP_HZ = 20;

/** Authoritative arena: runs the shared World sim; empty seats are bots. */
export class ArenaRoom extends Room {
  maxClients = 4;
  private world!: World;
  private slotBySession = new Map<string, number>();
  private pendingDash = [false, false, false, false];
  private pendingActivate = [false, false, false, false];
  private snapAccum = 0;
  private fxBuffer: FxEvent[] = [];

  onCreate(options: { mode?: string }) {
    const mode = MODES.find((m) => m.id === options?.mode) ?? MODES[0];
    this.world = new World({ mode, humans: 0, totalPlayers: 4, seed: (Math.floor(performance.now()) ^ 0x9e3779b9) >>> 0 });
    for (const p of this.world.players) p.isBot = true; // all bots until humans join
    this.world.startMatch();

    this.onMessage("input", (client: Client, data: NetInput) => this.onInput(client, data));
    this.onMessage("advance", () => this.world.forceAdvance());

    this.setSimulationInterval((dtMs) => this.update(dtMs / 1000), 1000 / SIM_HZ);
  }

  onJoin(client: Client) {
    const slot = this.world.players.findIndex((p) => p.isBot);
    const id = slot >= 0 ? slot : 0;
    if (slot >= 0) this.world.players[slot].isBot = false;
    this.slotBySession.set(client.sessionId, id);
    client.send("welcome", { id });
    // immediate snapshot so the joiner sees the board right away
    client.send("snap", buildSnapshot(this.world, []));
  }

  onLeave(client: Client) {
    const id = this.slotBySession.get(client.sessionId);
    if (id !== undefined) {
      const p = this.world.players[id];
      if (p) {
        p.isBot = true; // a bot takes over the abandoned seat
        p.wantDash = p.wantActivate = false;
      }
      this.slotBySession.delete(client.sessionId);
    }
  }

  private onInput(client: Client, data: NetInput) {
    const id = this.slotBySession.get(client.sessionId);
    if (id === undefined) return;
    const p = this.world.players[id];
    if (!p) return;
    p.moveX = data.moveX ?? 0;
    p.moveZ = data.moveZ ?? 0;
    p.wantMagnet = !!data.magnet;
    if (data.dash) this.pendingDash[id] = true;
    if (data.activate) this.pendingActivate[id] = true;
  }

  private update(dt: number) {
    // apply momentary inputs to human seats
    for (let i = 0; i < this.world.players.length; i++) {
      const p = this.world.players[i];
      if (!p.isBot) {
        p.wantDash = this.pendingDash[i];
        p.wantActivate = this.pendingActivate[i];
      }
    }

    this.world.tick(dt);

    // momentary inputs are one-shot
    for (let i = 0; i < this.pendingDash.length; i++) {
      this.pendingDash[i] = false;
      this.pendingActivate[i] = false;
    }

    // accumulate fx, broadcast snapshot ~SNAP_HZ
    const fx = this.world.drainFx();
    if (fx.length) this.fxBuffer.push(...fx);
    this.snapAccum += dt;
    if (this.snapAccum >= 1 / SNAP_HZ) {
      this.snapAccum = 0;
      this.broadcast("snap", buildSnapshot(this.world, this.fxBuffer));
      this.fxBuffer = [];
    }
  }
}
