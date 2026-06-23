import {
  ALL_GAMEPLAY_POWERUPS,
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  CONFIG,
  CORE_POWERUPS,
  MID_MATCH_POWERUPS,
  MODES,
  POWERUP_META,
  type BotDifficulty,
} from "../data/config";
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
  type BotPersonalityId,
  type PowerupPickup,
  type PowerupType,
  type RoundPhase,
} from "../data/types";
import { clamp, dist, dist2, len, lerp, moveToward, mulberry32 } from "./mathx";
import { sanitizeInputIntent, type PlayerInputIntent } from "./inputIntent";

const TUTORIAL_ASSIST_SECONDS = 45;
const TUTORIAL_BOT_SCORE_CAP = 8;
const TUTORIAL_BOT_SPEED_MULT = 0.62;
const TUTORIAL_BOT_BANK_MULT = 0.35;
const BOT_PERSONALITY_ORDER: BotPersonalityId[] = ["collector", "bruiser", "banker"];

export interface WorldOptions {
  mode: ModeDef;
  humans: number; // usually 1
  totalPlayers: number; // 2..4
  seed?: number;
  tutorialAssist?: boolean;
  botDifficulty?: BotDifficulty;
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
  humanId = 0; // which slot the local human controls (0 for single-player)
  tutorialAssist = false;
  botDifficulty: BotDifficulty = "normal";
  humanBankedThisMatch = false;
  round = 1;
  roundTime = 0; // seconds remaining
  introCountdown = 0;
  roundEndTimer = 0;
  suddenDeath = false;
  winnerId = -1;

  fx: FxEvent[] = [];

  // render-interpolation factor in [0,1]: how far the render frame sits between
  // the previous fixed-step state (Marble/Player px/pz/py) and the current pos.
  // Renderers lerp by this so motion is smooth on high-refresh displays / dropped
  // frames instead of snapping in discrete 60Hz chunks.
  renderAlpha = 1;

  private nextMarbleId = 1;
  private nextPickupId = 1;
  private accumulator = 0;
  private bankDrain: number[] = []; // fractional bank accumulator per player
  private kingScoreMeter = 0;

  constructor(opts: WorldOptions) {
    this.mode = opts.mode;
    this.humans = opts.humans;
    this.tutorialAssist = !!opts.tutorialAssist;
    this.botDifficulty = opts.botDifficulty ?? "normal";
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
      const isBot = i >= this.humans;
      const p: Player = {
        id: i,
        isBot,
        name: PLAYER_NAMES[i],
        colorHex: PLAYER_COLORS[i],
        colorIndex: i,
        teamId: this.teamForSlot(i),
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        y: 0,
        vy: 0,
        radius: CONFIG.player.radius,
        score: 0,
        lives: this.mode.lives ?? 0,
        alive: true,
        respawnTimer: 0,
        moveX: 0,
        moveZ: 0,
        lastMoveX: 0,
        lastMoveZ: 0,
        wantMagnet: false,
        wantDash: false,
        wantActivate: false,
        magnetActive: false,
        dashCooldown: 0,
        dashTimer: 0,
        dashDirX: 0,
        dashDirZ: 0,
        cluster: [],
        bankStreak: 0,
        bankStreakUntil: 0,
        bankRunActive: false,
        heldPowerup: null,
        activeUntil: {},
        goalAngle: angle,
        botState: "search",
        botPersonality: isBot ? this.botPersonalityForSlot(i) : null,
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
        teamId: this.teamForSlot(i),
        colorHex: PLAYER_COLORS[i],
        angle,
        pos: { x: Math.cos(angle) * gr, z: Math.sin(angle) * gr },
        radius: 2.4,
        blockedUntil: 0,
      });
    }
  }

  private teamForSlot(slot: number): number {
    return this.mode.kind === "team-bank" ? slot % 2 : slot;
  }

  private botPersonalityForSlot(slot: number): BotPersonalityId {
    const offset = Math.max(0, slot - this.humans);
    return BOT_PERSONALITY_ORDER[offset % BOT_PERSONALITY_ORDER.length];
  }

  // ---------------------------------------------------------------- match flow
  startMatch() {
    this.round = 1;
    this.humanBankedThisMatch = false;
    for (const p of this.players) {
      p.score = 0;
      this.resetBankStreak(p);
    }
    this.winnerId = -1;
    this.startRound();
  }

  startRound() {
    this.suddenDeath = false;
    this.kingScoreMeter = 0;
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
      p.lives = this.mode.lives ?? 0;
      p.alive = true;
      p.respawnTimer = 0;
      p.cluster = [];
      p.heldPowerup = null;
      p.activeUntil = {};
      p.dashCooldown = 0;
      p.dashTimer = 0;
      p.lastMoveX = 0;
      p.lastMoveZ = 0;
      p.dashDirX = 0;
      p.dashDirZ = 0;
      this.resetBankStreak(p);
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
    // distribute in a ring band that sits CLEARLY inside the visible boundary
    // ring. The old band topped out at 0.82R (== the outer guide ring) so edge
    // marbles, drawn raised by +radius under the 3/4 tilt, read as "outside the
    // circle". Cap to playRadius - radius - margin and pull the band inward.
    const r = jumbo ? CONFIG.marble.jumboRadius : CONFIG.marble.radius;
    const maxRad = CONFIG.tableRadius - 1.8 - r; // stay off the rim/boundary band
    const ang = this.rng() * Math.PI * 2;
    const rad = initial
      ? Math.min(maxRad, lerp(CONFIG.tableRadius * 0.1, CONFIG.tableRadius * 0.66, Math.sqrt(this.rng())))
      : Math.min(maxRad, this.rng() * CONFIG.tableRadius * 0.5);
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
    const pool = this.powerupPoolForRound();
    const type = pool[(this.rng() * pool.length) | 0];
    return {
      id: this.nextPickupId++,
      pos: { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad },
      type,
      active: true,
      respawnTimer: 0,
      bob: this.rng() * Math.PI * 2,
    };
  }

  private powerupPoolForRound(): readonly PowerupType[] {
    if (this.round <= 1) return CORE_POWERUPS;
    if (this.round === 2) return MID_MATCH_POWERUPS;
    return ALL_GAMEPLAY_POWERUPS;
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
    if (this.round >= 3 || this.mode.kind === "battle" || this.mode.kind === "survival") {
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
    input: PlayerInputIntent
  ) {
    const p = this.players[playerId];
    if (!p) return;
    const safe = sanitizeInputIntent(input);
    p.moveX = safe.moveX;
    p.moveZ = safe.moveZ;
    p.wantMagnet = safe.magnet;
    // Edge-triggered inputs are accumulated (latched) until a fixed step
    // consumes them. The render loop runs faster than the 60Hz sim, so a dash /
    // activate press can land on a frame where no step runs — without latching
    // it would be overwritten and lost before the sim ever sees it.
    p.wantDash = p.wantDash || safe.dash;
    p.wantActivate = p.wantActivate || safe.activate;
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
      this.snapshotRenderPrev(); // capture state BEFORE this step for interpolation
      this.step(CONFIG.fixedDt);
      this.accumulator -= CONFIG.fixedDt;
      steps++;
    }
    if (steps === CONFIG.maxSubSteps) this.accumulator = 0; // avoid spiral of death
    // fraction into the next step; renderers lerp px/pz/py -> pos by this amount.
    this.renderAlpha = Math.min(1, Math.max(0, this.accumulator / CONFIG.fixedDt));
  }

  /** Store each body's current position as the interpolation origin (px/pz/py). */
  private snapshotRenderPrev() {
    for (const m of this.marbles) {
      m.px = m.pos.x;
      m.pz = m.pos.z;
      m.py = m.y;
    }
    for (const p of this.players) {
      p.px = p.pos.x;
      p.pz = p.pos.z;
      p.py = p.y;
    }
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
      this.updateBankStreakTimer(p);
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
    this.modeRuleStep(dt);
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
      if (this.mode.kind === "survival" && p.lives <= 0) return;
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawnPlayer(p);
      return;
    }

    // falling off the table
    if (p.y < 0 || this.offTable(p.pos, 0)) {
      this.fallStep(p, dt);
      if (!p.alive) return;
    }

    // activation of held powerup (consume the latched press either way)
    if (p.wantActivate) {
      if (p.heldPowerup) {
        this.activatePowerup(p, p.heldPowerup);
        p.heldPowerup = null;
      }
      p.wantActivate = false;
    }

    // magnet state
    p.magnetActive = p.wantMagnet && this.magnetUsable(p);

    const inputMag = Math.hypot(p.moveX, p.moveZ);
    if (inputMag > 0.001) {
      p.lastMoveX = p.moveX / inputMag;
      p.lastMoveZ = p.moveZ / inputMag;
    }

    // dash (consume the latched press either way)
    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (p.dashTimer > 0) p.dashTimer -= dt;
    if (p.wantDash) {
      if (p.dashCooldown <= 0 && p.dashTimer <= 0) {
        const dashDir = this.dashDirection(p, inputMag);
        if (dashDir) {
          p.dashDirX = dashDir.x;
          p.dashDirZ = dashDir.z;
          p.dashTimer = CONFIG.player.dashDuration;
          p.dashCooldown = CONFIG.player.dashCooldown;
        }
      }
      p.wantDash = false;
    }

    // desired velocity from input
    let speed: number = CONFIG.player.moveSpeed * this.carrySpeedMultiplier(p);
    if (this.hasPU(p, "turbo")) speed *= CONFIG.powerups.turboSpeedMult;
    if (this.hasPU(p, "superMagnet")) speed += CONFIG.powerups.superMagnetSpeedBonus;
    if (this.hasPU(p, "heavyCore")) speed *= CONFIG.combat.heavyCoreSpeedMult;
    const dashing = p.dashTimer > 0;
    if (dashing) speed = CONFIG.player.dashSpeed;
    if (p.isBot) {
      speed *= this.tutorialBotAssistActive() ? TUTORIAL_BOT_SPEED_MULT : BOT_DIFFICULTIES[this.botDifficulty].speedMult;
    }

    let driveX = p.moveX;
    let driveZ = p.moveZ;
    let mag = inputMag;
    if (dashing && mag <= 0.001) {
      driveX = p.dashDirX;
      driveZ = p.dashDirZ;
      mag = Math.hypot(driveX, driveZ);
    }
    let tvx = 0;
    let tvz = 0;
    if (mag > 0.001) {
      const m = Math.min(mag, 1);
      tvx = (driveX / mag) * speed * m;
      tvz = (driveZ / mag) * speed * m;
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

  private carrySpeedMultiplier(p: Player): number {
    if (p.cluster.length <= 0) return 1;
    return Math.max(
      CONFIG.carry.minSpeedMultiplier,
      1 - p.cluster.length * CONFIG.carry.speedPenaltyPerMarble,
    );
  }

  private dashDirection(p: Player, inputMag: number): { x: number; z: number } | null {
    if (inputMag > 0.001) return { x: p.moveX / inputMag, z: p.moveZ / inputMag };
    const remembered = Math.hypot(p.lastMoveX, p.lastMoveZ);
    if (remembered > 0.001) return { x: p.lastMoveX / remembered, z: p.lastMoveZ / remembered };
    return null;
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
      const burst = this.hasPU(p, "magnetBurst");
      const radius = burst
        ? CONFIG.magnet.burstRadius
        : this.hasPU(p, "superMagnet")
        ? CONFIG.magnet.superRadius
        : CONFIG.magnet.radius;
      const forceMult = burst ? CONFIG.magnet.burstForceMult : 1;
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
        const f = (CONFIG.magnet.force * forceMult * Math.max(fall, 0)) / d;
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
    if ((CONFIG.feedback.clusterMilestones as readonly number[]).includes(p.cluster.length)) {
      this.fx.push({ kind: "cluster", x: p.pos.x, z: p.pos.z, color: p.colorHex, count: p.cluster.length });
    }
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
    if (!p.alive || p.cluster.length === 0) {
      p.bankRunActive = false;
      return;
    }
    const goal = this.bankGoalForPlayer(p);
    if (!goal) {
      this.bankDrain[p.id] = 0;
      p.bankRunActive = false;
      return;
    }
    const botAssist = p.isBot && this.tutorialBotAssistActive();
    if (botAssist && p.score >= TUTORIAL_BOT_SCORE_CAP) {
      this.bankDrain[p.id] = 0;
      return;
    }
    const bankRate = CONFIG.bank.drainPerSec * (botAssist ? TUTORIAL_BOT_BANK_MULT : 1);
    this.bankDrain[p.id] += bankRate * dt;
    while (this.bankDrain[p.id] >= 1 && p.cluster.length > 0) {
      const streakBonus = botAssist ? 0 : this.ensureBankRun(p, goal);
      this.bankDrain[p.id] -= 1;
      const id = p.cluster.shift()!;
      const m = byId.get(id);
      if (!m) continue;
      let pts = m.value;
      if (m.painted && m.paintedBy === p.id) pts *= CONFIG.bank.paintBonus;
      if (this.hasPU(p, "doubleScore")) pts *= 2;
      pts += streakBonus;
      if (botAssist && p.score + pts > TUTORIAL_BOT_SCORE_CAP) {
        p.cluster.unshift(id);
        this.bankDrain[p.id] = 0;
        return;
      }
      this.awardScore(p, pts);
      if (p.id === this.humanId) this.humanBankedThisMatch = true;
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
    if (p.cluster.length === 0) p.bankRunActive = false;
  }

  private ensureBankRun(p: Player, goal: Goal): number {
    if (!p.bankRunActive) {
      const chained = p.bankStreak > 0 && this.time <= p.bankStreakUntil;
      p.bankStreak = Math.min(CONFIG.bank.streakMax, (chained ? p.bankStreak : 0) + 1);
      p.bankStreakUntil = this.time + CONFIG.bank.streakWindow;
      p.bankRunActive = true;
      const bonus = this.bankStreakBonus(p);
      if (bonus > 0) {
        this.fx.push({
          kind: "bankStreak",
          x: goal.pos.x,
          z: goal.pos.z,
          color: p.colorHex,
          streak: p.bankStreak,
          bonus,
        });
      }
    }
    return this.bankStreakBonus(p);
  }

  private bankStreakBonus(p: Player) {
    return Math.max(0, Math.min(CONFIG.bank.streakMax, p.bankStreak) - 1);
  }

  private updateBankStreakTimer(p: Player) {
    if (p.bankStreak > 0 && !p.bankRunActive && this.time > p.bankStreakUntil) this.resetBankStreak(p);
  }

  private resetBankStreak(p: Player) {
    p.bankStreak = 0;
    p.bankStreakUntil = 0;
    p.bankRunActive = false;
  }

  private bankGoalForPlayer(p: Player): Goal | null {
    let best: Goal | null = null;
    let bestDistance = Infinity;
    for (const goal of this.goals) {
      if (this.mode.kind === "team-bank") {
        if (goal.teamId !== p.teamId) continue;
      } else if (goal.ownerId !== p.id) {
        continue;
      }
      if (this.time < goal.blockedUntil) continue;
      const d = dist(p.pos, goal.pos);
      if (d <= goal.radius && d < bestDistance) {
        best = goal;
        bestDistance = d;
      }
    }
    return best;
  }

  private awardScore(p: Player, points: number) {
    if (points <= 0) return;
    if (this.mode.kind === "team-bank") {
      for (const teammate of this.players) {
        if (teammate.teamId === p.teamId) teammate.score += points;
      }
      return;
    }
    p.score += points;
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
        this.resolveCircles(p, m, this.playerMass(p), CONFIG.marble.mass, CONFIG.marble.restitution);
      }
      for (let j = i + 1; j < ps.length; j++) {
        this.resolvePlayers(p, ps[j]);
      }
    }
  }

  private playerMass(p: Player): number {
    return CONFIG.player.mass * (this.hasPU(p, "heavyCore") ? CONFIG.combat.heavyCoreMassMult : 1);
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
    const aSpeedBeforeImpact = Math.hypot(a.vel.x, a.vel.z);
    const bSpeedBeforeImpact = Math.hypot(b.vel.x, b.vel.z);
    // physics push
    this.resolveCircles(a, b, this.playerMass(a), this.playerMass(b), 0.4 + CONFIG.combat.pushImpulse * 0.2);

    if (relSpeed < CONFIG.combat.bumpSpeed) return;
    // determine aggressor from pre-impact velocity; collision response can
    // transfer speed to the victim before steal logic runs.
    const attacker = aSpeedBeforeImpact >= bSpeedBeforeImpact ? a : b;
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
      if (this.mode.kind === "battle") {
        this.awardScore(attacker, CONFIG.combat.battleKnockoffBonus);
        this.fx.push({ kind: "knockoff", x: victim.pos.x, z: victim.pos.z });
      }
      return; // actual knockoff resolved when they cross the rim
    }

    // steal a fraction of victim cluster
    if (victim.cluster.length > 0 && this.time - attacker.lastBumpFx > 0.25) {
      attacker.lastBumpFx = this.time;
      const steal = Math.max(1, Math.floor(victim.cluster.length * CONFIG.combat.stealFraction));
      const byId = this.marbleMap();
      let stolen = 0;
      for (let k = 0; k < steal; k++) {
        const id = victim.cluster.pop();
        if (id === undefined) break;
        const m = byId.get(id);
        if (!m) continue;
        stolen++;
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
      if (this.mode.kind === "battle") this.awardScore(attacker, stolen * CONFIG.combat.battleStealScore);
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
      this.resetBankStreak(body);
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
        if (this.mode.kind === "survival") {
          body.lives = Math.max(0, body.lives - 1);
          body.respawnTimer = body.lives > 0 ? CONFIG.player.respawnTime : 0;
          if (body.lives <= 0) {
            body.vel = { x: 0, z: 0 };
            this.fx.push({ kind: "knockoff", x: body.pos.x, z: body.pos.z });
          }
        } else {
          body.respawnTimer = CONFIG.player.respawnTime;
        }
        body.y = 0;
      } else {
        this.recycleMarble(body as Marble);
      }
    }
  }

  private dropCluster(p: Player, scatter: boolean) {
    if (p.cluster.length === 0) return;
    this.dropSomeCluster(p, p.cluster.length, scatter);
  }

  private dropSomeCluster(p: Player, count: number, scatter: boolean): number {
    if (p.cluster.length === 0 || count <= 0) return 0;
    const byId = this.marbleMap();
    let dropped = 0;
    const ids = p.cluster.splice(Math.max(0, p.cluster.length - count), count);
    for (const id of ids) {
      const m = byId.get(id);
      if (!m) continue;
      m.state = "free";
      m.carrier = -1;
      m.y = 0;
      dropped++;
      if (scatter) {
        const ang = this.rng() * Math.PI * 2;
        const spd = 3 + this.rng() * 4;
        m.pos.x = p.pos.x + Math.cos(ang) * 1.2;
        m.pos.z = p.pos.z + Math.sin(ang) * 1.2;
        m.vel.x = Math.cos(ang) * spd;
        m.vel.z = Math.sin(ang) * spd;
      }
    }
    return dropped;
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
    if (type === "magnetBurst" || type === "heavyCore") {
      const dur = CONFIG.powerups.durations[type] ?? 3;
      p.activeUntil[type] = this.time + dur;
      this.fx.push({ kind: "powerup", x: p.pos.x, z: p.pos.z, type });
      return;
    }
    if (type === "shockPulse") {
      let hit = false;
      const r2 = CONFIG.combat.shockPulseRadius * CONFIG.combat.shockPulseRadius;
      for (const other of this.players) {
        if (other.id === p.id || !other.alive || other.y < 0) continue;
        const dx = other.pos.x - p.pos.x;
        const dz = other.pos.z - p.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        hit = true;
        const d = Math.max(Math.sqrt(d2), 0.3);
        other.vel.x += (dx / d) * CONFIG.combat.shockPulseImpulse;
        other.vel.z += (dz / d) * CONFIG.combat.shockPulseImpulse;
        const drop = Math.max(1, Math.ceil(other.cluster.length * CONFIG.combat.shockPulseDropFraction));
        const dropped = this.dropSomeCluster(other, drop, true);
        if (this.mode.kind === "battle" && dropped > 0) this.awardScore(p, dropped);
        if (dropped > 0) this.fx.push({ kind: "steal", x: other.pos.x, z: other.pos.z, color: p.colorHex });
      }
      if (hit) this.fx.push({ kind: "hit", x: p.pos.x, z: p.pos.z });
      else this.fx.push({ kind: "powerup", x: p.pos.x, z: p.pos.z, type });
      return;
    }
    if (type === "plusFive") {
      let pts: number = CONFIG.powerups.plusFive;
      if (this.hasPU(p, "doubleScore")) pts *= 2;
      if (p.isBot && this.tutorialBotAssistActive()) {
        pts = Math.min(pts, Math.max(0, TUTORIAL_BOT_SCORE_CAP - p.score));
        if (pts <= 0) return;
      }
      this.awardScore(p, pts);
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

  private modeRuleStep(dt: number) {
    if (this.mode.kind === "king-magnet") {
      this.kingScoreMeter += dt;
      while (this.kingScoreMeter >= CONFIG.king.scoreEvery) {
        this.kingScoreMeter -= CONFIG.king.scoreEvery;
        const leader = this.kingLeader();
        if (leader) {
          this.awardScore(leader, CONFIG.king.scoreAmount);
          this.fx.push({ kind: "bank", x: leader.pos.x, z: leader.pos.z, color: leader.colorHex, big: false });
        }
      }
    }

    if (this.mode.kind === "survival") {
      const active = this.players.filter((p) => p.lives > 0);
      if (active.length <= 1) {
        if (active[0]) this.awardScore(active[0], 5);
        this.endRound();
      }
    }
  }

  private kingLeader(): Player | null {
    let best: Player | null = null;
    let bestCluster = CONFIG.king.minCluster - 1;
    let tied = false;
    for (const p of this.players) {
      if (!p.alive || p.cluster.length < CONFIG.king.minCluster) continue;
      if (p.cluster.length > bestCluster) {
        best = p;
        bestCluster = p.cluster.length;
        tied = false;
      } else if (p.cluster.length === bestCluster) {
        tied = true;
      }
    }
    return tied ? null : best;
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
    const assist = this.tutorialBotAssistActive();
    const difficulty = BOT_DIFFICULTIES[this.botDifficulty];
    const personality = p.botPersonality ? BOT_PERSONALITIES[p.botPersonality] : BOT_PERSONALITIES.collector;
    const skill = clamp(CONFIG.bot.skill * difficulty.skillMult * personality.skillMult * (assist ? 0.55 : 1), 0.05, 1);
    const goal = this.goals[p.id];

    // periodic high-level decision
    if (p.botTimer <= 0) {
      p.botTimer = CONFIG.bot.retargetEvery * personality.retargetMult * (assist ? 1.45 : difficulty.retargetMult) * (0.7 + this.rng() * 0.6);
      const timeLeft = this.roundTime;
      if (p.cluster.length >= personality.bankWhenCluster || timeLeft < CONFIG.bot.bankWhenTimeLeft) {
        p.botState = "bank";
      } else if (this.rng() < CONFIG.bot.attackChance * difficulty.attackMult * personality.attackMult * skill && p.cluster.length <= personality.attackClusterMax) {
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
        p.botTargetMarble = this.nearestFreeMarble(p.pos, personality.jumboBias);
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
        if (dist(p.pos, o.pos) < 3) dash = this.rng() < personality.dashChance * difficulty.attackMult;
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
        p.botTargetMarble = this.nearestFreeMarble(p.pos, personality.jumboBias);
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

    this.setInput(p.id, { moveX: dx * personality.speedMult, moveZ: dz * personality.speedMult, magnet, dash, activate: false });
  }

  private tutorialBotAssistActive(): boolean {
    if (!this.tutorialAssist || this.humanBankedThisMatch || this.round !== 1 || this.phase !== "playing") return false;
    return this.mode.duration - this.roundTime <= TUTORIAL_ASSIST_SECONDS;
  }

  private botMaybeActivate(p: Player) {
    if (!p.heldPowerup) return;
    const t = p.heldPowerup;
    let activate = false;
    if (t === "magnetBurst" && p.botState === "collect") activate = true;
    else if (t === "shockPulse" && p.botState === "attack") activate = true;
    else if (t === "heavyCore" && (p.botState === "attack" || p.botState === "bank")) activate = true;
    else if (t === "paint" && p.cluster.length >= 5) activate = true;
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

  private nearestFreeMarble(from: { x: number; z: number }, jumboBias = 0.4): number {
    let best = -1;
    let bestD = Infinity;
    for (const m of this.marbles) {
      if (m.state !== "free" || m.y < 0) continue;
      const d = dist2(from, m.pos);
      const w = m.isJumbo ? d * jumboBias : d; // lower bias means stronger preference for jumbos
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
      if (this.leadGroupCount() > 1 && !this.suddenDeath) {
        this.suddenDeath = true;
        this.roundTime = 0.0001; // stay in overtime; ends on next bank below
      }
    }
    if (this.suddenDeath) {
      // end overtime as soon as the tie is broken
      if (this.leadGroupCount() > 1) {
        this.roundTime = 0.0001;
        return; // keep playing
      }
    }
    this.endRound();
  }

  private leadGroupCount(): number {
    if (this.mode.kind === "team-bank") {
      const teamScores = new Map<number, number>();
      for (const p of this.players) {
        if (!teamScores.has(p.teamId)) teamScores.set(p.teamId, p.score);
      }
      const scores = [...teamScores.values()];
      const top = Math.max(...scores);
      return scores.filter((score) => score === top).length;
    }

    const top = Math.max(...this.players.map((p) => p.score));
    return this.players.filter((p) => p.score === top).length;
  }

  private endRound() {
    this.phase = "roundEnd";
    this.roundEndTimer = 4.5;
  }

  private advanceAfterRound() {
    if (this.round >= this.mode.rounds) {
      this.phase = "matchEnd";
      this.winnerId = this.resolveWinnerId();
    } else {
      this.round++;
      this.startRound();
    }
  }

  private resolveWinnerId(): number {
    if (this.mode.kind === "survival") {
      let winner: Player | null = null;
      for (const p of this.players) {
        if (!winner) {
          winner = p;
          continue;
        }
        if (p.lives > winner.lives) {
          winner = p;
        } else if (p.lives === winner.lives && p.score > winner.score) {
          winner = p;
        }
      }
      return winner?.id ?? -1;
    }

    if (this.mode.kind === "team-bank") {
      let topTeam = -1;
      let topScore = -1;
      const seen = new Set<number>();
      for (const p of this.players) {
        if (seen.has(p.teamId)) continue;
        seen.add(p.teamId);
        const score = this.players.filter((mate) => mate.teamId === p.teamId)[0]?.score ?? 0;
        if (score > topScore) {
          topScore = score;
          topTeam = p.teamId;
        }
      }
      const humanTeamWinner = this.players.find((p) => p.teamId === topTeam && p.id === this.humanId);
      return humanTeamWinner?.id ?? this.players.find((p) => p.teamId === topTeam)?.id ?? -1;
    }

    let top = -1;
    let id = -1;
    for (const p of this.players) {
      if (p.score > top) {
        top = p.score;
        id = p.id;
      }
    }
    return id;
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

  /** No-op locally; NetView uses this to flush input to the server. */
  flushInput(_dt: number) {
    void _dt;
  }
}

export function makeWorld(
  modeId: string,
  totalPlayers: number,
  seed?: number,
  opts: { tutorialAssist?: boolean; botDifficulty?: BotDifficulty } = {},
): World {
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0];
  return new World({ mode, humans: 1, totalPlayers, seed, tutorialAssist: opts.tutorialAssist, botDifficulty: opts.botDifficulty });
}
