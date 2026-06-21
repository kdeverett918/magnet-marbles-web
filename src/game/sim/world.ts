import { CONFIG, MODES, POWERUP_META } from "../data/config";
import {
  CANDY_COLORS,
  JUMBO_COLOR,
  PLAYER_COLORS,
  PLAYER_NAMES,
  type AutoGoalRing,
  type FxEvent,
  type Goal,
  type GoalButton,
  type Marble,
  type ModeDef,
  type Player,
  type PowerupPickup,
  type PowerupType,
  type RoundPhase,
} from "../data/types";
import { clamp, dist, dist2, len, lerp, moveToward, mulberry32 } from "./mathx";

const ALL_POWERUPS: PowerupType[] = [
  "superMagnet",
  "doubleScore",
  "plusFive",
  "turbo",
  "disableMagnet",
  "paint",
];

export interface WorldOptions {
  mode: ModeDef;
  humans: number; // usually 1
  totalPlayers: number; // 2..4
  seed?: number;
}

/**
 * The authoritative, framework-agnostic Magnet Marbles simulation.
 * Owns all mutable state and the full match state machine.
 * The render layer steps it, reads its arrays, and drains its fx queue.
 */
export class World {
  mode: ModeDef;
  rng: () => number;
  time = 0; // sim seconds elapsed (monotonic)
  humans: number;

  players: Player[] = [];
  marbles: Marble[] = [];
  goals: Goal[] = [];
  pickups: PowerupPickup[] = [];
  buttons: GoalButton[] = [];
  rings: AutoGoalRing[] = [];

  phase: RoundPhase = "menu";
  round = 1;
  roundTime = 0; // seconds remaining
  introCountdown = 0;
  roundEndTimer = 0;
  suddenDeath = false;
  winnerId = -1;

  fx: FxEvent[] = [];

  private nextMarbleId = 1;
  private nextPickupId = 1;
  private accumulator = 0;
  private bankDrain: number[] = []; // fractional bank accumulator per player

  constructor(opts: WorldOptions) {
    this.mode = opts.mode;
    this.humans = opts.humans;
    this.rng = mulberry32(opts.seed ?? 1337);
    this.setupPlayers(opts.totalPlayers);
  }

  // ---------------------------------------------------------------- setup
  private setupPlayers(total: number) {
    const n = clamp(total, 2, 4);
    this.players = [];
    this.goals = [];
    this.bankDrain = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.PI / 4;
      const p: Player = {
        id: i,
        isBot: i >= this.humans,
        name: PLAYER_NAMES[i],
        colorHex: PLAYER_COLORS[i],
        colorIndex: i,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        y: 0,
        vy: 0,
        radius: CONFIG.player.radius,
        score: 0,
        alive: true,
        respawnTimer: 0,
        moveX: 0,
        moveZ: 0,
        wantMagnet: false,
        wantDash: false,
        wantActivate: false,
        magnetActive: false,
        dashCooldown: 0,
        dashTimer: 0,
        cluster: [],
        heldPowerup: null,
        activeUntil: {},
        goalAngle: angle,
        botState: "search",
        botTimer: 0,
        botTargetMarble: -1,
        botTargetPlayer: -1,
        lastBumpFx: 0,
        recentlyBanked: 0,
      };
      this.players.push(p);
      this.bankDrain.push(0);

      const gr = CONFIG.tableRadius - 2.1;
      this.goals.push({
        ownerId: i,
        colorHex: PLAYER_COLORS[i],
        angle,
        pos: { x: Math.cos(angle) * gr, z: Math.sin(angle) * gr },
        radius: 2.4,
        blockedUntil: 0,
      });
    }
  }

  // ---------------------------------------------------------------- match flow
  startMatch() {
    this.round = 1;
    for (const p of this.players) p.score = 0;
    this.winnerId = -1;
    this.startRound();
  }

  startRound() {
    this.suddenDeath = false;
    this.roundTime = this.mode.duration;
    this.introCountdown = 3.2;
    this.phase = "intro";
    this.spawnField();
    this.spawnPickups();
    this.spawnObstacles();
    this.resetPlayersForRound();
  }

  private resetPlayersForRound() {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      const a = p.goalAngle;
      const r = CONFIG.tableRadius - 4.5;
      p.pos = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      p.vel = { x: 0, z: 0 };
      p.y = 0;
      p.vy = 0;
      p.alive = true;
      p.respawnTimer = 0;
      p.cluster = [];
      p.heldPowerup = null;
      p.activeUntil = {};
      p.dashCooldown = 0;
      p.dashTimer = 0;
      p.botState = "search";
      p.botTimer = 0;
      this.bankDrain[i] = 0;
    }
  }

  private spawnField() {
    this.marbles = [];
    this.nextMarbleId = 1;
    const count = CONFIG.collectibleCount;
    for (let i = 0; i < count; i++) this.spawnCollectible(true);
    if (this.mode.jumbo) {
      for (let i = 0; i < CONFIG.jumboCount; i++) this.spawnCollectible(true, true);
    }
  }

  private spawnCollectible(initial: boolean, jumbo = false): Marble {
    // distribute in a ring band so the field reads like the reference art
    const ang = this.rng() * Math.PI * 2;
    const rad = initial
      ? lerp(CONFIG.tableRadius * 0.18, CONFIG.tableRadius * 0.82, Math.sqrt(this.rng()))
      : this.rng() * CONFIG.tableRadius * 0.5;
    const color = jumbo ? JUMBO_COLOR : CANDY_COLORS[(this.rng() * CANDY_COLORS.length) | 0];
    const m: Marble = {
      id: this.nextMarbleId++,
      pos: { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad },
      vel: { x: 0, z: 0 },
      y: 0,
      vy: 0,
      radius: jumbo ? CONFIG.marble.jumboRadius : CONFIG.marble.radius,
      colorHex: color,
      value: jumbo ? 5 : 1,
      isJumbo: jumbo,
      state: "free",
      carrier: -1,
      painted: false,
      paintedBy: -1,
      orbitAngle: 0,
      orbitRing: 0,
      spin: this.rng() * Math.PI * 2,
      deadTimer: 0,
    };
    this.marbles.push(m);
    return m;
  }

  private spawnPickups() {
    this.pickups = [];
    this.nextPickupId = 1;
    for (let i = 0; i < CONFIG.powerups.spawnCount; i++) {
      this.pickups.push(this.makePickup());
    }
  }

  private makePickup(): PowerupPickup {
    const ang = this.rng() * Math.PI * 2;
    const rad = lerp(2, CONFIG.tableRadius * 0.62, this.rng());
    const type = ALL_POWERUPS[(this.rng() * ALL_POWERUPS.length) | 0];
    return {
      id: this.nextPickupId++,
      pos: { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad },
      type,
      active: true,
      respawnTimer: 0,
      bob: this.rng() * Math.PI * 2,
    };
  }

  private spawnObstacles() {
    this.buttons = [];
    this.rings = [];
    // Round 1 is clean; obstacles ramp in on later rounds (My Street style).
    if (this.round >= 2) {
      // goal-block buttons: one near center per opponent goal
      const n = this.players.length;
      for (let i = 0; i < n; i++) {
        const a = this.goals[i].angle + Math.PI; // opposite side of table
        const r = CONFIG.tableRadius * 0.34;
        this.buttons.push({
          id: i,
          pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
          targetGoalOwnerId: i,
          cooldown: 0,
          pressedFlash: 0,
        });
      }
    }
    if (this.round >= 3 || this.mode.id === "blitz") {
      // blue-arrow auto-goal rings feeding the two "lowest" goals dynamically
      const n = this.players.length;
      for (let i = 0; i < Math.min(2, n); i++) {
        const a = (i / 2) * Math.PI * 2;
        const r = CONFIG.tableRadius * 0.5;
        this.rings.push({
          id: i,
          pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
          radius: 3.0,
          targetGoalOwnerId: i % n,
          spin: 0,
        });
      }
    }
  }

  // ---------------------------------------------------------------- input
  setInput(
    playerId: number,
    input: {
      moveX: number;
      moveZ: number;
      magnet: boolean;
      dash: boolean;
      activate: boolean;
    }
  ) {
    const p = this.players[playerId];
    if (!p) return;
    p.moveX = input.moveX;
    p.moveZ = input.moveZ;
    p.wantMagnet = input.magnet;
    p.wantDash = input.dash;
    p.wantActivate = input.activate;
  }

  /** Advance the match by real elapsed time, running fixed sub-steps. */
  tick(realDt: number) {
    realDt = Math.min(realDt, 0.1); // clamp huge frame gaps
    if (this.phase === "intro") {
      this.introCountdown -= realDt;
      if (this.introCountdown <= 0) this.phase = "playing";
      return;
    }
    if (this.phase === "roundEnd") {
      this.roundEndTimer -= realDt;
      if (this.roundEndTimer <= 0) this.advanceAfterRound();
      return;
    }
    if (this.phase !== "playing") return;

    this.accumulator += realDt;
    let steps = 0;
    while (this.accumulator >= CONFIG.fixedDt && steps < CONFIG.maxSubSteps) {
      this.step(CONFIG.fixedDt);
      this.accumulator -= CONFIG.fixedDt;
      steps++;
    }
    if (steps === CONFIG.maxSubSteps) this.accumulator = 0; // avoid spiral of death
  }

  // ---------------------------------------------------------------- fixed step
  private step(dt: number) {
    this.time += dt;

    // round timer
    this.roundTime -= dt;
    if (this.roundTime <= 0) {
      this.roundTime = 0;
      this.onRoundTimeUp();
      if (this.phase !== "playing") return;
    }

    for (const p of this.players) {
      if (p.isBot) this.botThink(p, dt);
      this.updatePlayer(p, dt);
    }
    this.magnetStep(dt);
    this.updateMarbles(dt);
    this.updateCarried(dt);
    this.collide();
    this.pickupStep(dt);
    this.obstacleStep(dt);
    this.respawnStep(dt);
  }

  // ---------------------------------------------------------------- players
  private magnetUsable(p: Player): boolean {
    return (p.activeUntil.disableMagnet ?? 0) <= this.time;
  }

  private hasPU(p: Player, t: PowerupType): boolean {
    return (p.activeUntil[t] ?? 0) > this.time;
  }

  private updatePlayer(p: Player, dt: number) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawnPlayer(p);
      return;
    }

    // falling off the table
    if (p.y < 0 || this.offTable(p.pos, 0)) {
      this.fallStep(p, dt);
      if (!p.alive) return;
    }

    // activation of held powerup
    if (p.wantActivate && p.heldPowerup) {
      this.activatePowerup(p, p.heldPowerup);
      p.heldPowerup = null;
      p.wantActivate = false;
    }

    // magnet state
    p.magnetActive = p.wantMagnet && this.magnetUsable(p);

    // dash
    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (p.dashTimer > 0) p.dashTimer -= dt;
    if (p.wantDash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      p.dashTimer = CONFIG.player.dashDuration;
      p.dashCooldown = CONFIG.player.dashCooldown;
    }

    // desired velocity from input
    let speed: number = CONFIG.player.moveSpeed;
    if (this.hasPU(p, "turbo")) speed *= CONFIG.powerups.turboSpeedMult;
    if (this.hasPU(p, "superMagnet")) speed += CONFIG.powerups.superMagnetSpeedBonus;
    const dashing = p.dashTimer > 0;
    if (dashing) speed = CONFIG.player.dashSpeed;

    const mag = Math.hypot(p.moveX, p.moveZ);
    let tvx = 0;
    let tvz = 0;
    if (mag > 0.001) {
      const m = Math.min(mag, 1);
      tvx = (p.moveX / mag) * speed * m;
      tvz = (p.moveZ / mag) * speed * m;
    }
    const accel = CONFIG.player.accel * (dashing ? 2.2 : 1);
    p.vel.x = moveToward(p.vel.x, tvx, accel * dt);
    p.vel.z = moveToward(p.vel.z, tvz, accel * dt);
    // passive drag toward zero when no input
    if (mag <= 0.001 && !dashing) {
      const k = Math.exp(-CONFIG.player.drag * dt);
      p.vel.x *= k;
      p.vel.z *= k;
    }

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;

    this.rimCheck(p, dt);
  }

  private respawnPlayer(p: Player) {
    const a = p.goalAngle;
    const r = CONFIG.tableRadius - 4.5;
    p.pos = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    p.vel = { x: 0, z: 0 };
    p.y = 0;
    p.vy = 0;
    p.alive = true;
  }

  // ---------------------------------------------------------------- magnet
  private magnetStep(dt: number) {
    for (const p of this.players) {
      if (!p.alive || !p.magnetActive) continue;
      const radius = this.hasPU(p, "superMagnet")
        ? CONFIG.magnet.superRadius
        : CONFIG.magnet.radius;
      const r2 = radius * radius;
      const capR2 = CONFIG.magnet.captureRadius * CONFIG.magnet.captureRadius;
      const full = p.cluster.length >= CONFIG.magnet.clusterCap;
      for (const m of this.marbles) {
        if (m.state !== "free" || m.y < 0) continue;
        const d2 = dist2(m.pos, p.pos);
        if (d2 > r2) continue;
        if (!full && d2 < capR2) {
          this.capture(p, m);
          continue;
        }
        const d = Math.max(Math.sqrt(d2), CONFIG.magnet.minDistance);
        const fall = 1 - (d - CONFIG.magnet.minDistance) / radius;
        const f = (CONFIG.magnet.force * Math.max(fall, 0)) / d;
        m.vel.x += (p.pos.x - m.pos.x) * f * dt;
        m.vel.z += (p.pos.z - m.pos.z) * f * dt;
      }
    }
  }

  private capture(p: Player, m: Marble) {
    if (p.cluster.length >= CONFIG.magnet.clusterCap) return;
    m.state = "carried";
    m.carrier = p.id;
    m.vel.x = 0;
    m.vel.z = 0;
    const idx = p.cluster.length;
    m.orbitRing = Math.floor(idx / CONFIG.carry.perRing);
    m.orbitAngle = (idx % CONFIG.carry.perRing) * ((Math.PI * 2) / CONFIG.carry.perRing);
    p.cluster.push(m.id);
    this.fx.push({ kind: "pickup", x: m.pos.x, z: m.pos.z, color: m.colorHex });
  }

  // ---------------------------------------------------------------- carried orbit + banking
  private updateCarried(dt: number) {
    const byId = this.marbleMap();
    for (const p of this.players) {
      if (p.cluster.length === 0) continue;
      const spin = this.time * CONFIG.carry.spinSpeed;
      // reflow ring assignments to stay tidy
      for (let i = 0; i < p.cluster.length; i++) {
        const m = byId.get(p.cluster[i]);
        if (!m) continue;
        const ring = Math.floor(i / CONFIG.carry.perRing);
        const slot = i % CONFIG.carry.perRing;
        const ringR = CONFIG.carry.ringRadius + ring * CONFIG.carry.ringSpacing;
        const a = spin + slot * ((Math.PI * 2) / CONFIG.carry.perRing) + ring * 0.5;
        const tx = p.pos.x + Math.cos(a) * ringR;
        const tz = p.pos.z + Math.sin(a) * ringR;
        m.pos.x = lerp(m.pos.x, tx, CONFIG.carry.followLerp);
        m.pos.z = lerp(m.pos.z, tz, CONFIG.carry.followLerp);
        m.y = 0.15 + Math.sin(this.time * 6 + i) * 0.04;
      }
      // banking at own goal
      this.bankStep(p, dt, byId);
    }
  }

  private bankStep(p: Player, dt: number, byId: Map<number, Marble>) {
    if (!p.alive || p.cluster.length === 0) return;
    const goal = this.goals[p.id];
    if (this.time < goal.blockedUntil) return; // goal currently blocked
    if (dist(p.pos, goal.pos) > goal.radius) {
      this.bankDrain[p.id] = 0;
      return;
    }
    this.bankDrain[p.id] += CONFIG.bank.drainPerSec * dt;
    while (this.bankDrain[p.id] >= 1 && p.cluster.length > 0) {
      this.bankDrain[p.id] -= 1;
      const id = p.cluster.shift()!;
      const m = byId.get(id);
      if (!m) continue;
      let pts = m.value;
      if (m.painted && m.paintedBy === p.id) pts *= CONFIG.bank.paintBonus;
      if (this.hasPU(p, "doubleScore")) pts *= 2;
      p.score += pts;
      p.recentlyBanked++;
      this.fx.push({
        kind: "bank",
        x: goal.pos.x,
        z: goal.pos.z,
        color: p.colorHex,
        big: m.isJumbo || pts >= 4,
      });
      this.recycleMarble(m);
    }
  }

  // ---------------------------------------------------------------- free marbles
  private updateMarbles(dt: number) {
    const drag = Math.exp(-CONFIG.marble.drag * dt);
    for (const m of this.marbles) {
      if (m.state === "dead") {
        m.deadTimer -= dt;
        continue;
      }
      if (m.state !== "free") continue;
      if (m.y < 0 || this.offTable(m.pos, 0)) {
        this.fallStep(m, dt);
        continue;
      }
      m.vel.x *= drag;
      m.vel.z *= drag;
      m.pos.x += m.vel.x * dt;
      m.pos.z += m.vel.z * dt;
      m.spin += len(m.vel) * dt * 2.2;
      this.rimCheck(m, dt);
    }
  }

  // ---------------------------------------------------------------- collisions
  private collide() {
    const free = this.marbles.filter((m) => m.state === "free" && m.y >= 0);
    // marble-marble
    for (let i = 0; i < free.length; i++) {
      const a = free[i];
      for (let j = i + 1; j < free.length; j++) {
        this.resolveCircles(a, free[j], CONFIG.marble.mass, CONFIG.marble.mass, CONFIG.marble.restitution);
      }
    }
    // player-marble + player-player
    const ps = this.players.filter((p) => p.alive && p.y >= 0);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      for (const m of free) {
        this.resolveCircles(p, m, CONFIG.player.mass, CONFIG.marble.mass, CONFIG.marble.restitution);
      }
      for (let j = i + 1; j < ps.length; j++) {
        this.resolvePlayers(p, ps[j]);
      }
    }
  }

  private resolveCircles(
    a: { pos: { x: number; z: number }; vel: { x: number; z: number }; radius: number },
    b: { pos: { x: number; z: number }; vel: { x: number; z: number }; radius: number },
    ma: number,
    mb: number,
    rest: number
  ) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const rsum = a.radius + b.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rsum * rsum || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const overlap = rsum - d;
    const inv = 1 / (ma + mb);
    // positional correction
    a.pos.x -= nx * overlap * (mb * inv);
    a.pos.z -= nz * overlap * (mb * inv);
    b.pos.x += nx * overlap * (ma * inv);
    b.pos.z += nz * overlap * (ma * inv);
    // impulse
    const rvx = b.vel.x - a.vel.x;
    const rvz = b.vel.z - a.vel.z;
    const vn = rvx * nx + rvz * nz;
    if (vn > 0) return;
    const jimp = (-(1 + rest) * vn) * inv;
    a.vel.x -= jimp * mb * nx;
    a.vel.z -= jimp * mb * nz;
    b.vel.x += jimp * ma * nx;
    b.vel.z += jimp * ma * nz;
  }

  private resolvePlayers(a: Player, b: Player) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const rsum = a.radius + b.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rsum * rsum || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const relSpeed = Math.hypot(b.vel.x - a.vel.x, b.vel.z - a.vel.z);
    // physics push
    this.resolveCircles(a, b, CONFIG.player.mass, CONFIG.player.mass, 0.4 + CONFIG.combat.pushImpulse * 0.2);

    if (relSpeed < CONFIG.combat.bumpSpeed) return;
    // determine aggressor = faster mover
    const aSpeed = Math.hypot(a.vel.x, a.vel.z);
    const bSpeed = Math.hypot(b.vel.x, b.vel.z);
    const attacker = aSpeed >= bSpeed ? a : b;
    const victim = attacker === a ? b : a;
    const cx = (a.pos.x + b.pos.x) / 2;
    const cz = (a.pos.z + b.pos.z) / 2;
    this.fx.push({ kind: "hit", x: cx, z: cz });

    // near-edge hard hit -> knock off
    const victimEdge = len(victim.pos) > CONFIG.tableRadius - 2.2;
    if (relSpeed >= CONFIG.combat.knockoffSpeed && victimEdge) {
      // shove victim outward hard; rimCheck will send them off
      victim.vel.x += nx * (attacker === a ? 1 : -1) * relSpeed * 0.6;
      victim.vel.z += nz * (attacker === a ? 1 : -1) * relSpeed * 0.6;
      return; // actual knockoff resolved when they cross the rim
    }

    // steal a fraction of victim cluster
    if (victim.cluster.length > 0 && this.time - attacker.lastBumpFx > 0.25) {
      attacker.lastBumpFx = this.time;
      const steal = Math.max(1, Math.floor(victim.cluster.length * CONFIG.combat.stealFraction));
      const byId = this.marbleMap();
      for (let k = 0; k < steal; k++) {
        const id = victim.cluster.pop();
        if (id === undefined) break;
        const m = byId.get(id);
        if (!m) continue;
        if (attacker.cluster.length < CONFIG.magnet.clusterCap) {
          m.carrier = attacker.id;
          attacker.cluster.push(id);
        } else {
          // scatter
          m.state = "free";
          m.carrier = -1;
          m.y = 0;
          const ang = this.rng() * Math.PI * 2;
          m.vel.x = Math.cos(ang) * 4;
          m.vel.z = Math.sin(ang) * 4;
        }
      }
      this.fx.push({ kind: "steal", x: victim.pos.x, z: victim.pos.z, color: attacker.colorHex });
    }
  }

  // ---------------------------------------------------------------- rim / falling
  private offTable(pos: { x: number; z: number }, margin: number) {
    return len(pos) > CONFIG.tableRadius + margin;
  }

  private rimCheck(body: Marble | Player, _dt: number) {
    const d = len(body.pos);
    if (d <= CONFIG.tableRadius) return;
    const nx = body.pos.x / d;
    const nz = body.pos.z / d;
    const outward = body.vel.x * nx + body.vel.z * nz;
    if (outward > CONFIG.rimEscapeSpeed) {
      // crosses the rim -> begin falling
      this.beginFall(body);
    } else {
      // bounce back in off the rim lip
      const clampR = CONFIG.tableRadius - body.radius * 0.4;
      body.pos.x = nx * clampR;
      body.pos.z = nz * clampR;
      const vn = outward;
      body.vel.x -= (1 + CONFIG.rimBounce) * vn * nx;
      body.vel.z -= (1 + CONFIG.rimBounce) * vn * nz;
    }
  }

  private beginFall(body: Marble | Player) {
    if (body.y < 0) return;
    body.y = -0.0001;
    body.vy = 0;
    if ("cluster" in body) {
      // player falling: drop the whole cluster (scatter) — fall-scoring nuance
      this.dropCluster(body, true);
      this.fx.push({ kind: "fall", x: body.pos.x, z: body.pos.z });
    } else {
      this.fx.push({ kind: "fall", x: body.pos.x, z: body.pos.z });
    }
  }

  private fallStep(body: Marble | Player, dt: number) {
    body.vy -= CONFIG.gravity * dt;
    body.y += body.vy * dt;
    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
    if (body.y <= CONFIG.fallLimit) {
      if ("cluster" in body) {
        body.alive = false;
        body.respawnTimer = CONFIG.player.respawnTime;
        body.y = 0;
      } else {
        this.recycleMarble(body as Marble);
      }
    }
  }

  private dropCluster(p: Player, scatter: boolean) {
    if (p.cluster.length === 0) return;
    const byId = this.marbleMap();
    for (const id of p.cluster) {
      const m = byId.get(id);
      if (!m) continue;
      m.state = "free";
      m.carrier = -1;
      m.y = 0;
      if (scatter) {
        const ang = this.rng() * Math.PI * 2;
        const spd = 3 + this.rng() * 4;
        m.pos.x = p.pos.x + Math.cos(ang) * 1.2;
        m.pos.z = p.pos.z + Math.sin(ang) * 1.2;
        m.vel.x = Math.cos(ang) * spd;
        m.vel.z = Math.sin(ang) * spd;
      }
    }
    p.cluster = [];
  }

  // ---------------------------------------------------------------- powerups
  private pickupStep(dt: number) {
    for (const pk of this.pickups) {
      pk.bob += dt;
      if (!pk.active) {
        pk.respawnTimer -= dt;
        if (pk.respawnTimer <= 0) {
          const fresh = this.makePickup();
          pk.pos = fresh.pos;
          pk.type = fresh.type;
          pk.active = true;
        }
        continue;
      }
      for (const p of this.players) {
        if (!p.alive || p.y < 0 || p.heldPowerup) continue;
        if (dist2(p.pos, pk.pos) < (p.radius + 0.7) * (p.radius + 0.7)) {
          p.heldPowerup = pk.type;
          pk.active = false;
          pk.respawnTimer = CONFIG.powerups.respawnTime;
          this.fx.push({ kind: "powerup", x: pk.pos.x, z: pk.pos.z, type: pk.type });
          break;
        }
      }
    }
  }

  private activatePowerup(p: Player, type: PowerupType) {
    const meta = POWERUP_META[type];
    if (type === "plusFive") {
      let pts = CONFIG.powerups.plusFive;
      if (this.hasPU(p, "doubleScore")) pts *= 2;
      p.score += pts;
      this.fx.push({ kind: "bank", x: p.pos.x, z: p.pos.z, color: p.colorHex, big: true });
      return;
    }
    if (type === "paint") {
      const byId = this.marbleMap();
      for (const id of p.cluster) {
        const m = byId.get(id);
        if (!m) continue;
        m.painted = true;
        m.paintedBy = p.id;
        m.colorHex = p.colorHex;
      }
      this.fx.push({ kind: "paint", x: p.pos.x, z: p.pos.z, color: p.colorHex });
      return;
    }
    if (type === "disableMagnet") {
      const until = this.time + (CONFIG.powerups.durations.disableMagnet ?? 5);
      for (const other of this.players) {
        if (other.id === p.id) continue;
        other.activeUntil.disableMagnet = until;
      }
      this.fx.push({ kind: "powerup", x: p.pos.x, z: p.pos.z, type });
      return;
    }
    // timed self-buffs
    const dur = CONFIG.powerups.durations[type] ?? 6;
    p.activeUntil[type] = this.time + dur;
    this.fx.push({ kind: "powerup", x: p.pos.x, z: p.pos.z, type });
    void meta;
  }

  // ---------------------------------------------------------------- obstacles
  private obstacleStep(dt: number) {
    // goal-block buttons
    for (const b of this.buttons) {
      if (b.cooldown > 0) b.cooldown -= dt;
      if (b.pressedFlash > 0) b.pressedFlash -= dt;
      if (b.cooldown > 0) continue;
      for (const p of this.players) {
        if (!p.alive || p.y < 0) continue;
        if (p.id === b.targetGoalOwnerId) continue; // can't block your own goal usefully
        if (dist2(p.pos, b.pos) < (p.radius + 0.8) * (p.radius + 0.8)) {
          this.goals[b.targetGoalOwnerId].blockedUntil = this.time + 5;
          b.cooldown = 8;
          b.pressedFlash = 0.6;
          this.fx.push({ kind: "hit", x: b.pos.x, z: b.pos.z });
          break;
        }
      }
    }
    // blue-arrow auto-goal rings
    for (const ring of this.rings) {
      ring.spin += dt;
      const goal = this.goals[ring.targetGoalOwnerId];
      const r2 = ring.radius * ring.radius;
      for (const m of this.marbles) {
        if (m.state !== "free" || m.y < 0) continue;
        if (dist2(m.pos, ring.pos) > r2) continue;
        // gentle pull toward the target goal
        const dx = goal.pos.x - m.pos.x;
        const dz = goal.pos.z - m.pos.z;
        const d = Math.max(Math.hypot(dx, dz), 0.5);
        m.vel.x += (dx / d) * 9 * dt;
        m.vel.z += (dz / d) * 9 * dt;
      }
    }
  }

  // ---------------------------------------------------------------- respawn / recycle
  private respawnStep(dt: number) {
    void dt;
    for (const m of this.marbles) {
      if (m.state === "dead" && m.deadTimer <= 0) {
        // re-seed near the center so the field stays lively all round
        const ang = this.rng() * Math.PI * 2;
        const rad = this.rng() * CONFIG.tableRadius * 0.45;
        m.pos = { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad };
        m.vel = { x: 0, z: 0 };
        m.y = 0;
        m.vy = 0;
        m.state = "free";
        m.carrier = -1;
        m.painted = false;
        m.paintedBy = -1;
        m.colorHex = m.isJumbo
          ? JUMBO_COLOR
          : CANDY_COLORS[(this.rng() * CANDY_COLORS.length) | 0];
      }
    }
  }

  private recycleMarble(m: Marble) {
    m.state = "dead";
    m.carrier = -1;
    m.y = 0;
    m.vy = 0;
    m.vel.x = 0;
    m.vel.z = 0;
    m.deadTimer = 2.5 + this.rng() * 2;
  }

  private marbleMap(): Map<number, Marble> {
    const map = new Map<number, Marble>();
    for (const m of this.marbles) map.set(m.id, m);
    return map;
  }

  // ---------------------------------------------------------------- bots (FSM)
  private botThink(p: Player, dt: number) {
    p.botTimer -= dt;
    const skill = CONFIG.bot.skill;
    const goal = this.goals[p.id];

    // periodic high-level decision
    if (p.botTimer <= 0) {
      p.botTimer = CONFIG.bot.retargetEvery * (0.7 + this.rng() * 0.6);
      const timeLeft = this.roundTime;
      if (p.cluster.length >= CONFIG.bot.bankWhenCluster || timeLeft < CONFIG.bot.bankWhenTimeLeft) {
        p.botState = "bank";
      } else if (this.rng() < CONFIG.bot.attackChance * skill && p.cluster.length < 5) {
        // find a juicy carrier to rob
        let best = -1;
        let bestScore = 0;
        for (const o of this.players) {
          if (o.id === p.id || !o.alive) continue;
          const s = o.cluster.length - dist(p.pos, o.pos) * 0.2;
          if (o.cluster.length >= 3 && s > bestScore) {
            bestScore = s;
            best = o.id;
          }
        }
        if (best >= 0) {
          p.botState = "attack";
          p.botTargetPlayer = best;
        } else p.botState = "collect";
      } else {
        p.botState = "collect";
      }
      // retarget nearest marble for collect/search
      if (p.botState === "collect") {
        p.botTargetMarble = this.nearestFreeMarble(p.pos);
        if (p.botTargetMarble < 0) p.botState = "bank";
      }
      // opportunistic activation of held powerup
      this.botMaybeActivate(p);
    }

    // steering toward current intent
    let tx = p.pos.x;
    let tz = p.pos.z;
    let magnet = false;
    let dash = false;

    if (p.botState === "bank") {
      tx = goal.pos.x;
      tz = goal.pos.z;
      magnet = p.cluster.length < CONFIG.magnet.clusterCap;
    } else if (p.botState === "attack") {
      const o = this.players[p.botTargetPlayer];
      if (o && o.alive) {
        tx = o.pos.x;
        tz = o.pos.z;
        if (dist(p.pos, o.pos) < 3) dash = this.rng() < 0.05;
      } else p.botState = "collect";
    } else {
      // collect / search
      const byId = this.marbleMap();
      const m = byId.get(p.botTargetMarble);
      if (m && m.state === "free") {
        tx = m.pos.x;
        tz = m.pos.z;
        magnet = true;
      } else {
        p.botTargetMarble = this.nearestFreeMarble(p.pos);
        magnet = true;
      }
    }

    // avoid driving off the edge: if target near rim and we're near rim, pull inward
    const myR = len(p.pos);
    if (myR > CONFIG.tableRadius - 2) {
      tx *= 0.6;
      tz *= 0.6;
    }

    let dx = tx - p.pos.x;
    let dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 0;
    }
    // a little imperfection scaled by skill
    const jitter = (1 - skill) * CONFIG.bot.reactionJitter;
    dx += (this.rng() - 0.5) * jitter;
    dz += (this.rng() - 0.5) * jitter;

    this.setInput(p.id, { moveX: dx, moveZ: dz, magnet, dash, activate: false });
  }

  private botMaybeActivate(p: Player) {
    if (!p.heldPowerup) return;
    const t = p.heldPowerup;
    let activate = false;
    if (t === "paint" && p.cluster.length >= 5) activate = true;
    else if (t === "plusFive") activate = true;
    else if (t === "doubleScore" && p.botState === "bank") activate = true;
    else if (t === "superMagnet" && p.botState === "collect") activate = true;
    else if (t === "turbo" && (p.botState === "attack" || p.botState === "bank")) activate = true;
    else if (t === "disableMagnet" && this.rng() < 0.5) activate = true;
    if (activate) {
      this.activatePowerup(p, t);
      p.heldPowerup = null;
    }
  }

  private nearestFreeMarble(from: { x: number; z: number }): number {
    let best = -1;
    let bestD = Infinity;
    for (const m of this.marbles) {
      if (m.state !== "free" || m.y < 0) continue;
      const d = dist2(from, m.pos);
      const w = m.isJumbo ? d * 0.4 : d; // bias toward jumbos
      if (w < bestD) {
        bestD = w;
        best = m.id;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- round end
  private onRoundTimeUp() {
    // sudden death: if tie at top in a sudden-death mode, keep playing until next bank
    if (this.mode.suddenDeath) {
      const top = Math.max(...this.players.map((p) => p.score));
      const leaders = this.players.filter((p) => p.score === top);
      if (leaders.length > 1 && !this.suddenDeath) {
        this.suddenDeath = true;
        this.roundTime = 0.0001; // stay in overtime; ends on next bank below
      }
    }
    if (this.suddenDeath) {
      // end overtime as soon as the tie is broken
      const top = Math.max(...this.players.map((p) => p.score));
      const leaders = this.players.filter((p) => p.score === top);
      if (leaders.length > 1) {
        this.roundTime = 0.0001;
        return; // keep playing
      }
    }
    this.endRound();
  }

  private endRound() {
    this.phase = "roundEnd";
    this.roundEndTimer = 4.5;
  }

  private advanceAfterRound() {
    if (this.round >= this.mode.rounds) {
      this.phase = "matchEnd";
      let top = -1;
      let id = -1;
      for (const p of this.players) {
        if (p.score > top) {
          top = p.score;
          id = p.id;
        }
      }
      this.winnerId = id;
    } else {
      this.round++;
      this.startRound();
    }
  }

  /** UI can skip the roundEnd / intro waits. */
  forceAdvance() {
    if (this.phase === "intro") {
      this.introCountdown = 0;
      this.phase = "playing";
    } else if (this.phase === "roundEnd") {
      this.advanceAfterRound();
    }
  }

  drainFx(): FxEvent[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }
}

export function makeWorld(modeId: string, totalPlayers: number, seed?: number): World {
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0];
  return new World({ mode, humans: 1, totalPlayers, seed });
}
