import type { FxEvent, Goal, Marble, Player, PowerupPickup, GoalButton, AutoGoalRing, RoundPhase } from "../data/types";
import type { NetInput, Snapshot } from "./protocol";

const STATE_NAME = ["dead", "free", "carried", "falling"] as const;

type Target = { tx: number; tz: number; ty: number };

/**
 * Client-side, render-only mirror of the authoritative server World.
 * Implements the same surface the scene/HUD read from a local World, so the
 * renderer is identical online vs offline. Positions are smoothed toward the
 * latest snapshot; scalar state is applied directly.
 */
export class NetView {
  time = 0;
  phase: RoundPhase = "intro";
  round = 1;
  roundTime = 0;
  introCountdown = 0;
  suddenDeath = false;
  winnerId = -1;
  mode = { rounds: 3 };

  players: (Player & Target)[] = [];
  marbles: (Marble & Target)[] = [];
  goals: Goal[] = [];
  pickups: PowerupPickup[] = [];
  buttons: GoalButton[] = [];
  rings: AutoGoalRing[] = [];

  fx: FxEvent[] = [];
  humanId = 0;

  private send: (type: string, data?: any) => void;
  private inputAccum = 0;
  private lastInput: NetInput = { moveX: 0, moveZ: 0, magnet: false, dash: false, activate: false };

  constructor(send: (type: string, data?: any) => void) {
    this.send = send;
  }

  applySnapshot(s: Snapshot) {
    this.time = s.t;
    this.phase = s.phase;
    this.round = s.round;
    this.mode.rounds = s.rounds;
    this.roundTime = s.roundTime;
    this.introCountdown = s.intro;
    this.suddenDeath = s.sd;
    this.winnerId = s.win;

    // players
    for (let i = 0; i < s.players.length; i++) {
      const sp = s.players[i];
      let p = this.players[i];
      if (!p) {
        p = this.blankPlayer(sp.id);
        this.players[i] = p;
      }
      p.id = sp.id;
      p.name = sp.name;
      p.colorHex = sp.c;
      p.colorIndex = sp.ci;
      p.score = sp.s;
      p.alive = sp.al;
      p.isBot = sp.bot;
      p.radius = 0.85;
      (p.cluster as number[]).length = sp.cl; // length is what the HUD reads
      p.magnetActive = sp.mag;
      p.heldPowerup = sp.hp;
      p.dashCooldown = sp.dc;
      p.vel.x = sp.vx;
      p.vel.z = sp.vz;
      p.tx = sp.x;
      p.tz = sp.z;
      p.ty = sp.y;
      p.activeUntil = {};
      for (const [t, rem] of sp.buffs) p.activeUntil[t] = this.time + rem;
      this.snapIfFar(p);
    }
    this.players.length = s.players.length;

    // marbles
    for (let i = 0; i < s.marbles.length; i++) {
      const sm = s.marbles[i];
      let m = this.marbles[i];
      if (!m) {
        m = this.blankMarble(i);
        this.marbles[i] = m;
      }
      m.colorHex = sm.c;
      m.radius = sm.r;
      m.isJumbo = sm.j;
      m.state = STATE_NAME[sm.st] ?? "dead";
      m.tx = sm.x;
      m.tz = sm.z;
      m.ty = sm.y;
      this.snapIfFar(m);
    }
    this.marbles.length = s.marbles.length;

    // goals
    this.goals = s.goals.map((g) => ({
      ownerId: g.id,
      colorHex: g.c,
      angle: g.a,
      pos: { x: g.x, z: g.z },
      radius: g.r,
      blockedUntil: g.bl > 0 ? this.time + g.bl : 0,
    }));

    // pickups
    for (let i = 0; i < s.pickups.length; i++) {
      const sp = s.pickups[i];
      let pk = this.pickups[i];
      if (!pk) {
        pk = { id: sp.id, pos: { x: sp.x, z: sp.z }, type: sp.t, active: sp.on, respawnTimer: 0, bob: 0 };
        this.pickups[i] = pk;
      }
      pk.id = sp.id;
      pk.pos.x = sp.x;
      pk.pos.z = sp.z;
      pk.type = sp.t;
      pk.active = sp.on;
    }
    this.pickups.length = s.pickups.length;

    this.buttons = s.buttons.map((b) => ({
      id: b.id,
      pos: { x: b.x, z: b.z },
      targetGoalOwnerId: b.tg,
      cooldown: b.cd,
      pressedFlash: b.fl,
    }));
    this.rings = s.rings.map((r) => ({ id: r.id, pos: { x: r.x, z: r.z }, radius: r.r, targetGoalOwnerId: 0, spin: 0 }));

    if (s.fx?.length) this.fx.push(...s.fx);
  }

  /** Arena interface: advance render-time interpolation. */
  tick(dt: number) {
    this.time += dt;
    const k = 1 - Math.exp(-16 * dt); // smoothing toward targets
    for (const p of this.players) {
      p.pos.x += (p.tx - p.pos.x) * k;
      p.pos.z += (p.tz - p.pos.z) * k;
      p.y += (p.ty - p.y) * k;
    }
    for (const m of this.marbles) {
      m.pos.x += (m.tx - m.pos.x) * k;
      m.pos.z += (m.tz - m.pos.z) * k;
      m.y += (m.ty - m.y) * k;
      m.spin += (Math.abs(m.tx - m.pos.x) + Math.abs(m.tz - m.pos.z)) * 6 + dt * 0.5;
    }
    for (const pk of this.pickups) pk.bob += dt;
    for (const r of this.rings) r.spin += dt;
    // momentary inputs are one-shot
    this.lastInput.dash = false;
    this.lastInput.activate = false;
  }

  setInput(_id: number, input: NetInput) {
    // persist continuous; latch momentary
    this.lastInput.moveX = input.moveX;
    this.lastInput.moveZ = input.moveZ;
    this.lastInput.magnet = input.magnet;
    if (input.dash) this.lastInput.dash = true;
    if (input.activate) this.lastInput.activate = true;
    this.inputAccum += 1;
  }

  /** Call from the render loop to flush input to the server ~25Hz. */
  flushInput(dt: number) {
    this.inputAccum += dt;
    if (this.inputAccum >= 1 / 25) {
      this.inputAccum = 0;
      this.send("input", this.lastInput);
      this.lastInput.dash = false;
      this.lastInput.activate = false;
    }
  }

  drainFx(): FxEvent[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  forceAdvance() {
    this.send("advance");
  }

  private snapIfFar(e: { pos: { x: number; z: number }; y: number } & Target) {
    const dx = e.tx - e.pos.x;
    const dz = e.tz - e.pos.z;
    if (dx * dx + dz * dz > 36) {
      e.pos.x = e.tx;
      e.pos.z = e.tz;
      e.y = e.ty;
    }
  }

  private blankPlayer(id: number): Player & Target {
    return {
      id, isBot: false, name: "", colorHex: "#fff", colorIndex: id,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, y: 0, vy: 0, radius: 0.85,
      score: 0, alive: true, respawnTimer: 0,
      moveX: 0, moveZ: 0, wantMagnet: false, wantDash: false, wantActivate: false,
      magnetActive: false, dashCooldown: 0, dashTimer: 0, cluster: [],
      heldPowerup: null, activeUntil: {}, goalAngle: 0,
      botState: "search", botTimer: 0, botTargetMarble: -1, botTargetPlayer: -1,
      lastBumpFx: 0, recentlyBanked: 0, tx: 0, tz: 0, ty: 0,
    };
  }

  private blankMarble(id: number): Marble & Target {
    return {
      id, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, y: 0, vy: 0, radius: 0.42,
      colorHex: "#fff", value: 1, isJumbo: false, state: "dead", carrier: -1,
      painted: false, paintedBy: -1, orbitAngle: 0, orbitRing: 0, spin: 0, deadTimer: 0,
      tx: 0, tz: 0, ty: 0,
    };
  }
}
