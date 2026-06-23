// Core data types for the Magnet Marbles simulation.

export type Vec2 = { x: number; z: number };

/** The four canonical player colors (My Street homage). Index = player slot. */
export const PLAYER_COLORS = ["#F24447", "#338CF2", "#4DCC66", "#FACC33"] as const;
export const PLAYER_NAMES = ["Crimson", "Cobalt", "Verdant", "Amber"] as const;

/** Candy-glass collectible hues — bright, distinct, "valuable". */
export const CANDY_COLORS = [
  "#27E0E0", // cyan
  "#FF4DD2", // magenta
  "#9CFF3D", // lime
  "#FFB23D", // amber
  "#B66BFF", // violet
  "#FF6B6B", // coral
] as const;

export const JUMBO_COLOR = "#FFD86B"; // iridescent gold

export type PowerupType =
  | "magnetBurst"
  | "shockPulse"
  | "heavyCore"
  | "superMagnet"
  | "doubleScore"
  | "plusFive"
  | "turbo"
  | "disableMagnet"
  | "paint"; // headline color-conversion paint bucket

export type MarbleState = "free" | "carried" | "falling" | "banked" | "dead";

export interface Marble {
  id: number;
  pos: Vec2;
  vel: Vec2;
  y: number; // height above table; 0 = on table, <0 = falling off
  vy: number; // vertical velocity while falling
  // render-interpolation: position at the start of the most recent fixed step
  // (World only; renderer lerps prev->pos by world.renderAlpha to kill stutter)
  px?: number;
  pz?: number;
  py?: number;
  radius: number;
  colorHex: string;
  value: number; // 1 normal, 5 jumbo
  isJumbo: boolean;
  state: MarbleState;
  carrier: number; // player id when carried, else -1
  painted: boolean; // converted to a player's color (banks at bonus)
  paintedBy: number; // player id who painted it
  // orbit slot when carried
  orbitAngle: number;
  orbitRing: number;
  // visual spin
  spin: number;
  // lifecycle timers
  deadTimer: number;
}

export type BotState = "search" | "collect" | "bank" | "attack" | "recover";
export type BotPersonalityId = "collector" | "bruiser" | "banker";

export interface Player {
  id: number;
  isBot: boolean;
  name: string;
  colorHex: string;
  colorIndex: number;
  teamId: number;
  pos: Vec2;
  vel: Vec2;
  y: number;
  vy: number;
  // render-interpolation previous position (World only; see Marble.px)
  px?: number;
  pz?: number;
  py?: number;
  radius: number;
  score: number;
  lives: number;
  alive: boolean;
  respawnTimer: number;
  // input intent (set by controls/bot each step), normalized direction + magnitude
  moveX: number;
  moveZ: number;
  lastMoveX: number;
  lastMoveZ: number;
  wantMagnet: boolean;
  wantDash: boolean;
  wantActivate: boolean; // press to activate held powerup
  // magnet/dash runtime
  magnetActive: boolean;
  dashCooldown: number;
  dashTimer: number; // active dash duration remaining
  dashDirX: number;
  dashDirZ: number;
  // carry
  cluster: number[]; // marble ids
  // banking mastery
  bankStreak: number; // quick consecutive bank runs, 1..bank.streakMax
  bankStreakUntil: number; // sim-time expiry for the current streak window
  bankRunActive: boolean; // true while this player is draining the current haul
  // powerups
  heldPowerup: PowerupType | null;
  activeUntil: Partial<Record<PowerupType, number>>; // sim-time expiry
  // goal
  goalAngle: number; // radians around the rim
  // bot
  botState: BotState;
  botPersonality: BotPersonalityId | null;
  botTimer: number;
  botTargetMarble: number;
  botTargetPlayer: number;
  // fx bookkeeping
  lastBumpFx: number;
  recentlyBanked: number; // count for HUD pulse
}

export interface Goal {
  ownerId: number;
  teamId: number;
  colorHex: string;
  angle: number;
  pos: Vec2;
  radius: number;
  blockedUntil: number; // sim-time; while > now the goal is blocked
}

export interface PowerupPickup {
  id: number;
  pos: Vec2;
  type: PowerupType;
  active: boolean;
  respawnTimer: number;
  bob: number;
}

/** A pressable button that temporarily blocks a target opponent goal. */
export interface GoalButton {
  id: number;
  pos: Vec2;
  targetGoalOwnerId: number;
  cooldown: number;
  pressedFlash: number;
}

/** A blue-arrow auto-goal ring: pulls nearby free marbles toward a target goal. */
export interface AutoGoalRing {
  id: number;
  pos: Vec2;
  radius: number;
  targetGoalOwnerId: number;
  spin: number;
}

export type RoundPhase = "menu" | "intro" | "playing" | "roundEnd" | "matchEnd";

export interface ModeDef {
  id: string;
  name: string;
  tagline: string;
  objective: string;
  kind: "classic" | "battle" | "king-magnet" | "team-bank" | "survival";
  rounds: number;
  duration: number;
  jumbo: boolean;
  suddenDeath: boolean;
  lives?: number;
}

/** One-shot visual events the sim emits; the render layer drains and plays them. */
export type FxEvent =
  | { kind: "pickup"; x: number; z: number; color: string }
  | { kind: "cluster"; x: number; z: number; color: string; count: number }
  | { kind: "bank"; x: number; z: number; color: string; big: boolean }
  | { kind: "bankStreak"; x: number; z: number; color: string; streak: number; bonus: number }
  | { kind: "hit"; x: number; z: number }
  | { kind: "steal"; x: number; z: number; color: string }
  | { kind: "knockoff"; x: number; z: number }
  | { kind: "paint"; x: number; z: number; color: string }
  | { kind: "powerup"; x: number; z: number; type: PowerupType }
  | { kind: "fall"; x: number; z: number };
