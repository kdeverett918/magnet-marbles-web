export const PROGRESSION_KEY = "magnet-marbles:progression:v1";

export interface TrailCosmetic {
  id: string;
  name: string;
  tagline: string;
  cost: number;
  color: string;
  skinColor: string;
  widthMult: number;
  length: number;
}

export interface DailyChallenge {
  id: string;
  dateLabel: string;
  modeId: string;
  modeName: string;
  playerCount: number;
  seed: number;
  target: string;
  rewardStars: number;
}

export interface ProgressionState {
  stars: number;
  totalStarsEarned: number;
  selectedTrail: string;
  unlockedTrails: string[];
  dailyCompleted: string[];
}

export interface MatchReward {
  stars: number;
  placement: number;
  won: boolean;
  dailyCompleted: boolean;
  reasons: string[];
}

export const TRAIL_COSMETICS: TrailCosmetic[] = [
  {
    id: "comet",
    name: "Comet",
    tagline: "Classic glass glow",
    cost: 0,
    color: "#56d0ff",
    skinColor: "#f24447",
    widthMult: 1,
    length: 4,
  },
  {
    id: "candy",
    name: "Candy Rift",
    tagline: "Pink-blue arcade streak",
    cost: 4,
    color: "#ff4dd2",
    skinColor: "#ff5fae",
    widthMult: 1.08,
    length: 4.8,
  },
  {
    id: "gold",
    name: "Gold Rush",
    tagline: "Warm trophy shimmer",
    cost: 8,
    color: "#f2c14e",
    skinColor: "#facc33",
    widthMult: 1.12,
    length: 5.2,
  },
  {
    id: "mint",
    name: "Mint Circuit",
    tagline: "Clean neon magnet trail",
    cost: 12,
    color: "#4dcc66",
    skinColor: "#38e0a0",
    widthMult: 1.16,
    length: 5.6,
  },
  {
    id: "violet",
    name: "Violet Storm",
    tagline: "High-energy rival glow",
    cost: 16,
    color: "#b66bff",
    skinColor: "#8f6bff",
    widthMult: 1.2,
    length: 6,
  },
  {
    id: "royal",
    name: "Royal Magnet",
    tagline: "Top-table prestige trail",
    cost: 22,
    color: "#ffffff",
    skinColor: "#d9e4ff",
    widthMult: 1.28,
    length: 6.4,
  },
];

const DAILY_MODES = [
  { modeId: "classic", modeName: "Classic", target: "Win a 4-player bank race", rewardStars: 2 },
  { modeId: "battle", modeName: "Battle", target: "Win with steal pressure", rewardStars: 3 },
  { modeId: "king-magnet", modeName: "King Magnet", target: "Hold the biggest cluster", rewardStars: 3 },
  { modeId: "team-bank", modeName: "Team Bank", target: "Carry your team to first", rewardStars: 3 },
  { modeId: "survival", modeName: "Survival", target: "Outlast the table", rewardStars: 3 },
] as const;

export const DEFAULT_PROGRESSION: ProgressionState = {
  stars: 0,
  totalStarsEarned: 0,
  selectedTrail: "comet",
  unlockedTrails: ["comet"],
  dailyCompleted: [],
};

export function normalizeProgression(raw: unknown): ProgressionState {
  const source = typeof raw === "object" && raw ? raw as Partial<ProgressionState> : {};
  const validTrailIds = new Set(TRAIL_COSMETICS.map((item) => item.id));
  const unlocked = Array.isArray(source.unlockedTrails)
    ? source.unlockedTrails.filter((id): id is string => typeof id === "string" && validTrailIds.has(id))
    : [];
  if (!unlocked.includes("comet")) unlocked.unshift("comet");

  const selected = typeof source.selectedTrail === "string" && unlocked.includes(source.selectedTrail)
    ? source.selectedTrail
    : "comet";

  return {
    stars: Math.max(0, Math.floor(Number(source.stars) || 0)),
    totalStarsEarned: Math.max(0, Math.floor(Number(source.totalStarsEarned) || 0)),
    selectedTrail: selected,
    unlockedTrails: [...new Set(unlocked)],
    dailyCompleted: Array.isArray(source.dailyCompleted)
      ? [...new Set(source.dailyCompleted.filter((id): id is string => typeof id === "string"))].slice(-30)
      : [],
  };
}

export function getTrailCosmetic(id: string): TrailCosmetic {
  return TRAIL_COSMETICS.find((item) => item.id === id) ?? TRAIL_COSMETICS[0];
}

export function unlockTrail(progress: ProgressionState, trailId: string): ProgressionState {
  const normalized = normalizeProgression(progress);
  const trail = TRAIL_COSMETICS.find((item) => item.id === trailId);
  if (!trail || normalized.unlockedTrails.includes(trail.id) || normalized.stars < trail.cost) return normalized;
  return {
    ...normalized,
    stars: normalized.stars - trail.cost,
    selectedTrail: trail.id,
    unlockedTrails: [...normalized.unlockedTrails, trail.id],
  };
}

export function selectTrail(progress: ProgressionState, trailId: string): ProgressionState {
  const normalized = normalizeProgression(progress);
  return normalized.unlockedTrails.includes(trailId)
    ? { ...normalized, selectedTrail: trailId }
    : normalized;
}

export function dailyChallengeFor(date = new Date()): DailyChallenge {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const id = day.toISOString().slice(0, 10);
  let hash = 2166136261;
  for (const ch of id) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const mode = DAILY_MODES[Math.abs(hash) % DAILY_MODES.length];
  return {
    id,
    dateLabel: day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    modeId: mode.modeId,
    modeName: mode.modeName,
    playerCount: 4,
    seed: hash >>> 0,
    target: mode.target,
    rewardStars: mode.rewardStars,
  };
}

export function rewardForMatch({
  won,
  placement,
  score,
  daily,
  dailyAlreadyCompleted,
}: {
  won: boolean;
  placement: number;
  score: number;
  daily?: DailyChallenge | null;
  dailyAlreadyCompleted?: boolean;
}): MatchReward {
  const reasons = ["Finished match"];
  let stars = 1;

  if (placement === 1) {
    stars += 2;
    reasons.push("1st place");
  } else if (placement === 2) {
    stars += 1;
    reasons.push("2nd place");
  }

  if (score >= 25) {
    stars += 1;
    reasons.push("25+ score");
  }

  const dailyCompleted = Boolean(daily && won && !dailyAlreadyCompleted);
  if (dailyCompleted && daily) {
    stars += daily.rewardStars;
    reasons.push("Daily challenge");
  }

  return { stars, placement, won, dailyCompleted, reasons };
}

export function applyReward(
  progress: ProgressionState,
  reward: MatchReward,
  dailyId?: string | null,
): ProgressionState {
  const normalized = normalizeProgression(progress);
  return normalizeProgression({
    ...normalized,
    stars: normalized.stars + reward.stars,
    totalStarsEarned: normalized.totalStarsEarned + reward.stars,
    dailyCompleted: reward.dailyCompleted && dailyId
      ? [...normalized.dailyCompleted, dailyId]
      : normalized.dailyCompleted,
  });
}
