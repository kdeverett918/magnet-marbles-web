import type { BotPersonalityId, ModeDef, PowerupType } from "./types";

export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_DIFFICULTIES: Record<
  BotDifficulty,
  { label: string; skillMult: number; attackMult: number; retargetMult: number; speedMult: number }
> = {
  easy: { label: "Easy", skillMult: 0.68, attackMult: 0.55, retargetMult: 1.35, speedMult: 0.86 },
  normal: { label: "Normal", skillMult: 1.0, attackMult: 1.0, retargetMult: 1.0, speedMult: 1.0 },
  hard: { label: "Hard", skillMult: 1.18, attackMult: 1.35, retargetMult: 0.78, speedMult: 1.08 },
};

export const BOT_PERSONALITIES: Record<
  BotPersonalityId,
  {
    label: string;
    short: string;
    desc: string;
    bankWhenCluster: number;
    attackClusterMax: number;
    attackMult: number;
    retargetMult: number;
    skillMult: number;
    speedMult: number;
    dashChance: number;
    jumboBias: number;
  }
> = {
  collector: {
    label: "Collector",
    short: "Collect",
    desc: "Builds bigger hauls and races for jumbo marbles.",
    bankWhenCluster: 12,
    attackClusterMax: 4,
    attackMult: 0.62,
    retargetMult: 0.95,
    skillMult: 1.05,
    speedMult: 1.0,
    dashChance: 0.035,
    jumboBias: 0.25,
  },
  bruiser: {
    label: "Bruiser",
    short: "Bruise",
    desc: "Hunts loaded rivals and dashes into carrier lanes.",
    bankWhenCluster: 8,
    attackClusterMax: 7,
    attackMult: 1.7,
    retargetMult: 0.82,
    skillMult: 0.96,
    speedMult: 1.04,
    dashChance: 0.095,
    jumboBias: 0.55,
  },
  banker: {
    label: "Banker",
    short: "Bank",
    desc: "Banks smaller hauls early and pressures the timer.",
    bankWhenCluster: 6,
    attackClusterMax: 3,
    attackMult: 0.48,
    retargetMult: 0.72,
    skillMult: 1.1,
    speedMult: 0.96,
    dashChance: 0.025,
    jumboBias: 0.42,
  },
};

export const CORE_POWERUPS: readonly PowerupType[] = [
  "magnetBurst",
  "shockPulse",
  "heavyCore",
];

export const ADVANCED_POWERUPS: readonly PowerupType[] = [
  "superMagnet",
  "doubleScore",
  "plusFive",
  "turbo",
  "disableMagnet",
  "paint",
];

export const MID_MATCH_POWERUPS: readonly PowerupType[] = [
  ...CORE_POWERUPS,
  "plusFive",
  "turbo",
  "paint",
];

export const ALL_GAMEPLAY_POWERUPS: readonly PowerupType[] = [
  ...CORE_POWERUPS,
  ...ADVANCED_POWERUPS,
];

/**
 * All gameplay tunables in one place (mirrors the Unity GameConfig ScriptableObject).
 * Change feel here, not scattered through the sim.
 */
export const CONFIG = {
  // --- Arena ---
  tableRadius: 14, // playable disc radius (world units)
  rimHeight: 0.55,
  rimBounce: 0.45, // restitution when a slow body grazes the rim
  rimEscapeSpeed: 7.5, // outward speed needed to cross the rim and fall off
  fallLimit: -9, // y at which a fallen body is considered gone
  gravity: 26, // fall acceleration once off the table

  // --- Fixed timestep ---
  fixedDt: 1 / 60,
  maxSubSteps: 5,

  // --- Player marble (shooter) ---
  player: {
    radius: 0.85,
    moveSpeed: 9.5,
    accel: 38, // how fast velocity chases the input target
    drag: 2.2, // passive damping
    mass: 6,
    dashSpeed: 19,
    dashDuration: 0.22,
    dashCooldown: 1.4,
    respawnTime: 2.2,
  },

  // --- Collectible marbles ---
  marble: {
    radius: 0.42,
    jumboRadius: 0.72,
    drag: 1.9,
    mass: 1,
    restitution: 0.32,
  },

  // --- Magnet ---
  magnet: {
    radius: 4.6,
    superRadius: 7.8,
    burstRadius: 6.9,
    force: 46,
    burstForceMult: 1.85,
    minDistance: 0.9, // distance floor to avoid blow-up
    captureRadius: 1.35, // within this -> joins cluster
    clusterCap: 18,
  },

  // --- Carry / orbit ---
  carry: {
    ringRadius: 1.35, // base orbit radius around player
    ringSpacing: 0.5, // each additional ring further out
    perRing: 7, // marbles per orbit ring
    spinSpeed: 2.4, // rad/s the cluster rotates
    followLerp: 0.55, // how snappily carried marbles track their slot
    speedPenaltyPerMarble: 0.012, // full hauls are riskier but still responsive
    minSpeedMultiplier: 0.78,
  },

  // --- Banking / scoring ---
  bank: {
    drainPerSec: 26, // marbles banked per second when at goal (juicy count-up)
    paintBonus: 2, // your-color (painted) marbles bank at this multiplier
    knockoffBonus: 2, // points to attacker for knocking a carrier off
    streakWindow: 8, // seconds to chain a fast return trip
    streakMax: 3, // +0, +1, +2 bonus points per banked marble
  },

  // --- Reward readability ---
  feedback: {
    clusterMilestones: [3, 6, 10, 18],
  },

  // --- Bump / steal / knock-off ---
  combat: {
    bumpSpeed: 7.5, // relative speed to trigger a steal
    stealFraction: 0.34, // fraction of victim cluster transferred on a bump
    knockoffSpeed: 11, // relative speed near edge to fully knock off
    pushImpulse: 1.0, // extra shove multiplier on player-player hit
    battleStealScore: 1,
    battleKnockoffBonus: 4,
    shockPulseRadius: 5.3,
    shockPulseDropFraction: 0.5,
    shockPulseImpulse: 7.5,
    heavyCoreMassMult: 2.2,
    heavyCoreSpeedMult: 0.82,
  },

  // --- Powerups ---
  powerups: {
    spawnCount: 3, // simultaneous pickups on the table
    respawnTime: 7,
    durations: {
      magnetBurst: 2.2,
      heavyCore: 4.5,
      superMagnet: 7,
      doubleScore: 9,
      turbo: 4.5,
      disableMagnet: 5, // applied to OTHERS when activated
      // plusFive & paint are instant
    } as Partial<Record<PowerupType, number>>,
    superMagnetSpeedBonus: 1.0,
    turboSpeedMult: 1.9,
    plusFive: 5,
  },

  // --- Mode scoring pressure ---
  king: {
    minCluster: 5,
    scoreEvery: 2,
    scoreAmount: 1,
  },

  // --- Bots ---
  bot: {
    reactionJitter: 0.35,
    bankWhenCluster: 10, // head home once cluster reaches this
    bankWhenTimeLeft: 8, // or when round is nearly over
    attackChance: 0.28, // chance to switch to attack on retarget
    skill: 0.82, // 0..1, scaled by BotDirector
    retargetEvery: 1.1,
    difficulties: BOT_DIFFICULTIES,
    personalities: BOT_PERSONALITIES,
  },

  // --- Camera --- symmetric whole-table framing (all 4 goals + rim visible)
  camera: {
    height: 33,
    distance: 21,
    fov: 42,
    fitMargin: 6.5, // extra world units beyond the rim kept in frame
    tiltLerp: 0.08, // (legacy) per-frame factor; superseded by `smooth`
    smooth: 8, // exponential follow rate (1/s) — frame-rate-independent: k = 1 - exp(-smooth*dt)
    parallax: 0, // static, table-centered view (no drift) — the whole board is framed
  },

  // --- Counts ---
  collectibleCount: 56,
  jumboCount: 4, // in heist/jumbo modes
} as const;

export const MODES: ModeDef[] = [
  {
    id: "classic",
    name: "Classic",
    tagline: "Bank the most marbles in 3 rounds.",
    objective: "Collect candy marbles, carry a risky cluster, and bank at your goal.",
    kind: "classic",
    rounds: 3,
    duration: 90,
    jumbo: false,
    suddenDeath: true,
  },
  {
    id: "battle",
    name: "Battle",
    tagline: "Steal, shove, and score from hits.",
    objective: "Dash into loaded rivals to steal marbles and earn combat points.",
    kind: "battle",
    rounds: 3,
    duration: 90,
    jumbo: false,
    suddenDeath: true,
  },
  {
    id: "king-magnet",
    name: "King Magnet",
    tagline: "Hold the biggest cluster for bonus points.",
    objective: "Carry the largest cluster; the King scores every 2 seconds.",
    kind: "king-magnet",
    rounds: 1,
    duration: 90,
    jumbo: true,
    suddenDeath: true,
  },
  {
    id: "team-bank",
    name: "Team Bank",
    tagline: "2v2 shared-score banking.",
    objective: "Bank at either team goal; your team shares every point.",
    kind: "team-bank",
    rounds: 3,
    duration: 90,
    jumbo: false,
    suddenDeath: true,
  },
  {
    id: "survival",
    name: "Survival",
    tagline: "Three lives. Last marble standing.",
    objective: "Stay on the table, steal safely, and outlast the other marbles.",
    kind: "survival",
    rounds: 1,
    duration: 90,
    jumbo: false,
    suddenDeath: false,
    lives: 3,
  },
];

export const POWERUP_META: Record<
  PowerupType,
  { label: string; short: string; color: string; glyph: string; instant: boolean; desc: string }
> = {
  magnetBurst: { label: "Magnet Burst", short: "MAG", color: "#56d0ff", glyph: "magnet", instant: false, desc: "Stronger pull for 2 seconds" },
  shockPulse: { label: "Shock Pulse", short: "PULSE", color: "#ff7a3d", glyph: "pulse", instant: true, desc: "Knock loose enemy carried marbles" },
  heavyCore: { label: "Heavy Core", short: "HEAVY", color: "#b6c4d8", glyph: "core", instant: false, desc: "Harder to shove, but slower" },
  superMagnet: { label: "Super Magnet", short: "MAG", color: "#56d0ff", glyph: "magnet", instant: false, desc: "Huge magnet range" },
  doubleScore: { label: "Double Score", short: "x2", color: "#ffd34d", glyph: "x2", instant: false, desc: "2x banked points" },
  plusFive: { label: "Plus Five", short: "+5", color: "#7CFF6B", glyph: "+5", instant: true, desc: "Instant +5 points" },
  turbo: { label: "Turbo", short: "TURBO", color: "#ff7a3d", glyph: "bolt", instant: false, desc: "Speed burst — shove rivals" },
  disableMagnet: { label: "Jam", short: "JAM", color: "#b06bff", glyph: "ban", instant: false, desc: "Disable rivals' magnets" },
  paint: { label: "Paint Bucket", short: "PAINT", color: "#ff4dd2", glyph: "drop", instant: true, desc: "Convert your cluster to your color (2x bank)" },
};
