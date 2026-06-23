export const PROGRESSION_KEY = "magnet-marbles:progression:v1";

export interface TrailCosmetic {
  id: string;
  name: string;
  tagline: string;
  cost: number;
  color: string;
  skinColor: string;
  skinAccent: string;
  finish: string;
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
  dailyStreak: DailyStreak;
  records: ModeRecords;
}

export interface MatchReward {
  stars: number;
  placement: number;
  won: boolean;
  dailyCompleted: boolean;
  reasons: string[];
}

export interface NextUnlock {
  trail: TrailCosmetic;
  starsNeeded: number;
  ready: boolean;
}

export interface DailyStreak {
  current: number;
  best: number;
  lastCompleted: string | null;
}

export interface DailyStreakPreview {
  current: number;
  best: number;
  next: number;
  completedToday: boolean;
}

export interface ModeRecord {
  bestScore: number;
  wins: number;
  matches: number;
}

export type ModeRecords = Record<string, ModeRecord>;

export interface ModeRecordResult {
  progression: ProgressionState;
  previous: ModeRecord;
  record: ModeRecord;
  isNewBest: boolean;
}

export const TRAIL_COSMETICS: TrailCosmetic[] = [
  {
    id: "comet",
    name: "Comet",
    tagline: "Classic glass glow",
    cost: 0,
    color: "#56d0ff",
    skinColor: "#f24447",
    skinAccent: "#ffd6a1",
    finish: "glass comet core",
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
    skinAccent: "#63d7ff",
    finish: "split candy swirl",
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
    skinAccent: "#fff2a8",
    finish: "trophy cat's-eye",
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
    skinAccent: "#d5fff3",
    finish: "neon circuit vein",
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
    skinAccent: "#ff8bef",
    finish: "charged storm vein",
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
    skinAccent: "#ffd76a",
    finish: "pearl prestige core",
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
  dailyStreak: { current: 0, best: 0, lastCompleted: null },
  records: {},
};

function safeCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
}

function normalizeRecords(raw: unknown): ModeRecords {
  if (typeof raw !== "object" || !raw) return {};
  const records: ModeRecords = {};
  for (const [modeId, value] of Object.entries(raw).slice(0, 24)) {
    if (!modeId || typeof value !== "object" || !value) continue;
    const record = value as Partial<ModeRecord>;
    records[modeId] = {
      bestScore: safeCount(record.bestScore),
      wins: safeCount(record.wins),
      matches: safeCount(record.matches),
    };
  }
  return records;
}

function isDailyId(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayIndex(id: string): number | null {
  if (!isDailyId(id)) return null;
  const [year, month, day] = id.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : null;
}

function normalizeDailyStreak(raw: unknown): DailyStreak {
  const source = typeof raw === "object" && raw ? raw as Partial<DailyStreak> : {};
  const current = safeCount(source.current);
  const best = Math.max(current, safeCount(source.best));
  return {
    current,
    best,
    lastCompleted: isDailyId(source.lastCompleted) ? source.lastCompleted : null,
  };
}

function applyDailyStreak(streak: DailyStreak, dailyId: string): DailyStreak {
  const last = streak.lastCompleted ? dayIndex(streak.lastCompleted) : null;
  const next = dayIndex(dailyId);
  if (next === null) return streak;
  if (last === next) return streak;
  const continued = last !== null && next - last === 1;
  const current = continued ? streak.current + 1 : 1;
  return {
    current,
    best: Math.max(streak.best, current),
    lastCompleted: dailyId,
  };
}

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
    dailyStreak: normalizeDailyStreak(source.dailyStreak),
    records: normalizeRecords(source.records),
  };
}

export function getTrailCosmetic(id: string): TrailCosmetic {
  return TRAIL_COSMETICS.find((item) => item.id === id) ?? TRAIL_COSMETICS[0];
}

export function nextUnlockFor(progress: ProgressionState): NextUnlock | null {
  const normalized = normalizeProgression(progress);
  const next = TRAIL_COSMETICS
    .filter((item) => !normalized.unlockedTrails.includes(item.id))
    .sort((a, b) => a.cost - b.cost)[0];
  if (!next) return null;
  const starsNeeded = Math.max(0, next.cost - normalized.stars);
  return {
    trail: next,
    starsNeeded,
    ready: starsNeeded === 0,
  };
}

export function dailyStreakFor(progress: ProgressionState, daily: DailyChallenge): DailyStreakPreview {
  const normalized = normalizeProgression(progress);
  const streak = normalized.dailyStreak;
  const completedToday = normalized.dailyCompleted.includes(daily.id) || streak.lastCompleted === daily.id;
  const preview = applyDailyStreak(streak, daily.id);
  return {
    current: streak.current,
    best: streak.best,
    next: completedToday ? streak.current : preview.current,
    completedToday,
  };
}

export function modeRecordFor(progress: ProgressionState, modeId: string): ModeRecord {
  const normalized = normalizeProgression(progress);
  const record = normalized.records[modeId];
  return record
    ? { ...record }
    : { bestScore: 0, wins: 0, matches: 0 };
}

export function recordMatch(
  progress: ProgressionState,
  match: { modeId: string; score: number; won: boolean },
): ModeRecordResult {
  const normalized = normalizeProgression(progress);
  const modeId = match.modeId.trim() || "classic";
  const previous = modeRecordFor(normalized, modeId);
  const score = safeCount(match.score);
  const record = {
    bestScore: Math.max(previous.bestScore, score),
    wins: previous.wins + (match.won ? 1 : 0),
    matches: previous.matches + 1,
  };
  return {
    progression: normalizeProgression({
      ...normalized,
      records: {
        ...normalized.records,
        [modeId]: record,
      },
    }),
    previous,
    record,
    isNewBest: score > previous.bestScore,
  };
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
  const dailyCompleted = reward.dailyCompleted && dailyId
    ? [...normalized.dailyCompleted, dailyId]
    : normalized.dailyCompleted;
  const dailyStreak = reward.dailyCompleted && dailyId
    ? applyDailyStreak(normalized.dailyStreak, dailyId)
    : normalized.dailyStreak;
  return normalizeProgression({
    ...normalized,
    stars: normalized.stars + reward.stars,
    totalStarsEarned: normalized.totalStarsEarned + reward.stars,
    dailyCompleted,
    dailyStreak,
  });
}
