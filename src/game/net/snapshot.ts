import type { World } from "../sim/world";
import type { FxEvent, PowerupType } from "../data/types";
import type { Snapshot, SnapPlayer } from "./protocol";

const BUFFS: PowerupType[] = ["magnetBurst", "heavyCore", "superMagnet", "doubleScore", "turbo", "disableMagnet"];
const STATE_CODE: Record<string, number> = { dead: 0, free: 1, carried: 2, falling: 3, banked: 0 };

/** Serialize the authoritative World into a wire snapshot (server-side). */
export function buildSnapshot(world: World, fx: FxEvent[]): Snapshot {
  return {
    t: world.time,
    phase: world.phase,
    mode: world.mode.id,
    round: world.round,
    rounds: world.mode.rounds,
    roundTime: world.roundTime,
    intro: world.introCountdown,
    sd: world.suddenDeath,
    win: world.winnerId,
    players: world.players.map<SnapPlayer>((p) => ({
      id: p.id,
      name: p.name,
      c: p.colorHex,
      ci: p.colorIndex,
      tm: p.teamId,
      s: p.score,
      lv: p.lives,
      cl: p.cluster.length,
      al: p.alive,
      bot: p.isBot,
      x: round2(p.pos.x),
      z: round2(p.pos.z),
      y: round2(p.y),
      vx: round2(p.vel.x),
      vz: round2(p.vel.z),
      mag: p.magnetActive,
      hp: p.heldPowerup,
      dc: round2(p.dashCooldown),
      buffs: BUFFS.filter((t) => (p.activeUntil[t] ?? 0) > world.time).map(
        (t) => [t, round2((p.activeUntil[t] ?? 0) - world.time)] as [PowerupType, number]
      ),
    })),
    marbles: world.marbles.map((m) => ({
      x: round2(m.pos.x),
      z: round2(m.pos.z),
      y: round2(m.y),
      c: m.colorHex,
      r: m.radius,
      j: m.isJumbo,
      st: STATE_CODE[m.state] ?? 0,
    })),
    goals: world.goals.map((g) => ({
      id: g.ownerId,
      tm: g.teamId,
      c: g.colorHex,
      a: g.angle,
      x: round2(g.pos.x),
      z: round2(g.pos.z),
      r: g.radius,
      bl: Math.max(0, round2(g.blockedUntil - world.time)),
    })),
    pickups: world.pickups.map((pk) => ({
      id: pk.id,
      x: round2(pk.pos.x),
      z: round2(pk.pos.z),
      t: pk.type,
      on: pk.active,
    })),
    buttons: world.buttons.map((b) => ({
      id: b.id,
      x: round2(b.pos.x),
      z: round2(b.pos.z),
      tg: b.targetGoalOwnerId,
      cd: round2(b.cooldown),
      fl: round2(b.pressedFlash),
    })),
    rings: world.rings.map((r) => ({
      id: r.id,
      x: round2(r.pos.x),
      z: round2(r.pos.z),
      r: r.radius,
      tg: r.targetGoalOwnerId,
      sp: round2(r.spin),
    })),
    fx,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
