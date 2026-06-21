import type { ModeDef, PowerupType } from "./types";

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
    force: 46,
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
  },

  // --- Banking / scoring ---
  bank: {
    drainPerSec: 26, // marbles banked per second when at goal (juicy count-up)
    paintBonus: 2, // your-color (painted) marbles bank at this multiplier
    knockoffBonus: 2, // points to attacker for knocking a carrier off
  },

  // --- Bump / steal / knock-off ---
  combat: {
    bumpSpeed: 7.5, // relative speed to trigger a steal
    stealFraction: 0.34, // fraction of victim cluster transferred on a bump
    knockoffSpeed: 11, // relative speed near edge to fully knock off
    pushImpulse: 1.0, // extra shove multiplier on player-player hit
  },

  // --- Powerups ---
  powerups: {
    spawnCount: 3, // simultaneous pickups on the table
    respawnTime: 7,
    durations: {
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

  // --- Bots ---
  bot: {
    reactionJitter: 0.35,
    bankWhenCluster: 10, // head home once cluster reaches this
    bankWhenTimeLeft: 8, // or when round is nearly over
    attackChance: 0.28, // chance to switch to attack on retarget
    skill: 0.82, // 0..1, scaled by BotDirector
    retargetEvery: 1.1,
  },

  // --- Camera --- symmetric whole-table framing (all 4 goals visible)
  camera: {
    height: 31,
    distance: 25,
    fov: 40,
    tiltLerp: 0.06,
    parallax: 0.05, // very slight drift toward the human; NOT a tight follow
  },

  // --- Counts ---
  collectibleCount: 56,
  jumboCount: 4, // in heist/jumbo modes
} as const;

export const MODES: ModeDef[] = [
  {
    id: "classic",
    name: "Classic",
    tagline: "Most marbles banked in 3 rounds wins.",
    rounds: 3,
    duration: 90,
    jumbo: false,
    suddenDeath: true,
  },
  {
    id: "heist",
    name: "Heist",
    tagline: "Golden jumbo marbles worth 5. High risk, high reward.",
    rounds: 3,
    duration: 90,
    jumbo: true,
    suddenDeath: true,
  },
  {
    id: "blitz",
    name: "Blitz",
    tagline: "One frantic 60-second round. Pure chaos.",
    rounds: 1,
    duration: 60,
    jumbo: false,
    suddenDeath: false,
  },
];

export const POWERUP_META: Record<
  PowerupType,
  { label: string; short: string; color: string; glyph: string; instant: boolean; desc: string }
> = {
  superMagnet: { label: "Super Magnet", short: "MAG", color: "#56d0ff", glyph: "magnet", instant: false, desc: "Huge magnet range" },
  doubleScore: { label: "Double Score", short: "x2", color: "#ffd34d", glyph: "x2", instant: false, desc: "2x banked points" },
  plusFive: { label: "Plus Five", short: "+5", color: "#7CFF6B", glyph: "+5", instant: true, desc: "Instant +5 points" },
  turbo: { label: "Turbo", short: "TURBO", color: "#ff7a3d", glyph: "bolt", instant: false, desc: "Speed burst — shove rivals" },
  disableMagnet: { label: "Jam", short: "JAM", color: "#b06bff", glyph: "ban", instant: false, desc: "Disable rivals' magnets" },
  paint: { label: "Paint Bucket", short: "PAINT", color: "#ff4dd2", glyph: "drop", instant: true, desc: "Convert your cluster to your color (2x bank)" },
};
