import { create } from "zustand";
import { BOT_DIFFICULTIES, type BotDifficulty } from "./data/config";
import type { PowerupType, RoundPhase } from "./data/types";
import { makeWorld } from "./sim/world";
import type { Arena } from "./sim/arena";
import { connect, type NetSession } from "./net/client";
import {
  PROGRESSION_KEY,
  applyReward,
  dailyChallengeFor,
  normalizeProgression,
  rewardForMatch,
  selectTrail,
  unlockTrail,
  type DailyChallenge,
  type MatchReward,
  type ProgressionState,
} from "./data/progression";
import { rankPlayersForResults, resultScoreForPlayer } from "./data/results";
import type { FeedbackMessage, FeedbackToast } from "./data/feedback";
import { isMotionMode, type MotionMode } from "./data/accessibility";

export type TutorialStep = "off" | "collect" | "bank" | "done";

export interface PlayerHud {
  id: number;
  name: string;
  colorHex: string;
  teamId: number;
  score: number;
  lives: number;
  cluster: number;
  isBot: boolean;
  alive: boolean;
}

export interface Hud {
  phase: RoundPhase;
  round: number;
  totalRounds: number;
  roundTime: number;
  introCountdown: number;
  suddenDeath: boolean;
  winnerId: number;
  modeId: string;
  modeName: string;
  modeKind: "classic" | "battle" | "king-magnet" | "team-bank" | "survival";
  modeObjective: string;
  humanId: number;
  players: PlayerHud[];
  heldPowerup: PowerupType | null;
  activePowerups: { type: PowerupType; remaining: number }[];
  dashCooldown: number;
  magnetActive: boolean;
  clusterCap: number;
  tutorialAssist: boolean;
  tutorialStep: TutorialStep;
  tutorialGoalPulse: boolean;
  tutorialComplete: boolean;
}

interface Settings {
  sound: boolean;
  sfxVolume: number;
  haptics: boolean;
  colorAssist: boolean;
  motion: MotionMode;
  quality: "high" | "lite";
  botDifficulty: BotDifficulty;
}

const SETTINGS_KEY = "magnet-marbles:settings:v1";
const TUTORIAL_KEY = "magnet-marbles:tutorial-complete:v1";
const DEFAULT_SFX_VOLUME = 0.65;
const DEFAULT_SETTINGS: Settings = {
  sound: true,
  sfxVolume: DEFAULT_SFX_VOLUME,
  haptics: true,
  colorAssist: false,
  motion: "auto",
  quality: "high",
  botDifficulty: "normal",
};

function clamp01(value: unknown, fallback = DEFAULT_SFX_VOLUME): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function defaultSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth <= 760;
  const lowMemory = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory) <= 4
    : false;
  return {
    sound: true,
    sfxVolume: DEFAULT_SFX_VOLUME,
    haptics: true,
    colorAssist: false,
    motion: "auto",
    quality: coarsePointer || narrowViewport || lowMemory ? "lite" : "high",
    botDifficulty: "normal",
  };
}

function isBotDifficulty(value: unknown): value is BotDifficulty {
  return typeof value === "string" && value in BOT_DIFFICULTIES;
}

function loadSettings(): Settings {
  const defaults = defaultSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : defaults.sound,
      sfxVolume: clamp01(parsed.sfxVolume, defaults.sfxVolume),
      haptics: typeof parsed.haptics === "boolean" ? parsed.haptics : defaults.haptics,
      colorAssist: typeof parsed.colorAssist === "boolean" ? parsed.colorAssist : defaults.colorAssist,
      motion: isMotionMode(parsed.motion) ? parsed.motion : defaults.motion,
      quality: parsed.quality === "lite" || parsed.quality === "high" ? parsed.quality : defaults.quality,
      botDifficulty: isBotDifficulty(parsed.botDifficulty) ? parsed.botDifficulty : defaults.botDifficulty,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage can be unavailable in private or embedded browsers */
  }
}

function tutorialComplete(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

function saveTutorialComplete() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* storage can be unavailable in private or embedded browsers */
  }
}

function loadProgression(): ProgressionState {
  if (typeof window === "undefined") return normalizeProgression(null);
  try {
    const raw = window.localStorage.getItem(PROGRESSION_KEY);
    return normalizeProgression(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProgression(null);
  }
}

function saveProgression(progression: ProgressionState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progression));
  } catch {
    /* storage can be unavailable in private or embedded browsers */
  }
}

export type NetStatus = "idle" | "connecting" | "connected" | "error";
export type NetState = { status: NetStatus; roomId: string; error: string; startedAt: number };
export type RewardSummary = MatchReward & { runId: number; dailyId: string | null };

interface GameStore {
  screen: "menu" | "game";
  online: boolean;
  paused: boolean;
  modeId: string;
  playerCount: number;
  settings: Settings;
  progression: ProgressionState;
  dailyChallenge: DailyChallenge;
  activeDailyId: string | null;
  runId: number;
  lastReward: RewardSummary | null;
  hud: Hud;
  feedback: FeedbackToast | null;
  net: NetState;
  startGame: (modeId: string, playerCount: number) => void;
  startDailyChallenge: () => void;
  startOnline: (modeId: string, roomCode?: string) => Promise<void>;
  quitToMenu: () => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  setMode: (id: string) => void;
  setPlayerCount: (n: number) => void;
  toggleSound: () => void;
  setSfxVolume: (volume: number) => void;
  toggleHaptics: () => void;
  toggleColorAssist: () => void;
  setMotion: (mode: MotionMode) => void;
  setQuality: (q: "high" | "lite") => void;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  unlockTrail: (id: string) => void;
  selectTrail: (id: string) => void;
  claimMatchReward: (hud: Hud) => void;
  pushHud: (hud: Hud) => void;
  pushFeedback: (feedback: FeedbackMessage | null) => void;
  clearFeedback: (id: number) => void;
}

const emptyHud: Hud = {
  phase: "menu", round: 1, totalRounds: 3, roundTime: 0, introCountdown: 0,
  suddenDeath: false, winnerId: -1,
  modeId: "classic", modeName: "Classic", modeKind: "classic", modeObjective: "Collect marbles and bank at your goal.",
  humanId: 0, players: [],
  heldPowerup: null, activePowerups: [], dashCooldown: 0, magnetActive: false, clusterCap: 18,
  tutorialAssist: false, tutorialStep: "off", tutorialGoalPulse: false, tutorialComplete: false,
};
const emptyNet: NetState = { status: "idle", roomId: "", error: "", startedAt: 0 };

// The single live arena (local World or networked NetView), held outside React.
let liveArena: Arena | null = null;
let session: NetSession | null = null;
let connectTicket = 0;
let feedbackId = 0;
export const getWorld = (): Arena | null => liveArena;

export const useGame = create<GameStore>((set, get) => ({
  screen: "menu",
  online: false,
  paused: false,
  modeId: "classic",
  playerCount: 4,
  settings: loadSettings(),
  progression: loadProgression(),
  dailyChallenge: dailyChallengeFor(),
  activeDailyId: null,
  runId: 0,
  lastReward: null,
  hud: emptyHud,
  feedback: null,
  net: emptyNet,

  startGame: (modeId, playerCount) => {
    connectTicket++;
    if (session) {
      const oldSession = session;
      session = null;
      try {
        oldSession.room.leave();
      } catch {
        /* noop */
      }
    }
    const botDifficulty = get().settings.botDifficulty;
    const w = makeWorld(modeId, playerCount, (Math.random() * 1e9) | 0, { tutorialAssist: !tutorialComplete(), botDifficulty });
    w.startMatch();
    liveArena = w;
    set((s) => ({
      screen: "game",
      online: false,
      paused: false,
      modeId,
      playerCount,
      activeDailyId: null,
      runId: s.runId + 1,
      lastReward: null,
      feedback: null,
      net: emptyNet,
    }));
  },

  startDailyChallenge: () => {
    connectTicket++;
    if (session) {
      const oldSession = session;
      session = null;
      try {
        oldSession.room.leave();
      } catch {
        /* noop */
      }
    }
    const daily = dailyChallengeFor();
    const botDifficulty = get().settings.botDifficulty;
    const w = makeWorld(daily.modeId, daily.playerCount, daily.seed, { tutorialAssist: false, botDifficulty });
    w.startMatch();
    liveArena = w;
    set((s) => ({
      screen: "game",
      online: false,
      paused: false,
      modeId: daily.modeId,
      playerCount: daily.playerCount,
      dailyChallenge: daily,
      activeDailyId: daily.id,
      runId: s.runId + 1,
      lastReward: null,
      feedback: null,
      net: emptyNet,
    }));
  },

  startOnline: async (modeId, roomCode) => {
    const ticket = ++connectTicket;
    if (session) {
      const oldSession = session;
      session = null;
      try {
        oldSession.room.leave();
      } catch {
        /* noop */
      }
    }
    liveArena = null;
    set({ online: false, paused: false, modeId, activeDailyId: null, lastReward: null, feedback: null, net: { status: "connecting", roomId: "", error: "", startedAt: Date.now() } });
    try {
      const s = await connect({ mode: modeId, roomCode });
      if (ticket !== connectTicket) {
        try {
          s.room.leave();
        } catch {
          /* stale connection */
        }
        return;
      }
      session = s;
      liveArena = s.view;
      s.room.onLeave(() => {
        set((st) =>
          st.online && session === s
            ? { ...st, net: { status: "error", roomId: st.net.roomId, error: "Disconnected from online match.", startedAt: 0 } }
            : st,
        );
      });
      set((st) => ({
        screen: "game",
        online: true,
        paused: false,
        modeId,
        runId: st.runId + 1,
        feedback: null,
        net: { status: "connected", roomId: s.roomId, error: "", startedAt: 0 },
      }));
    } catch (e: any) {
      if (ticket === connectTicket) {
        set({ net: { status: "error", roomId: "", error: e?.message || "Could not connect to server", startedAt: 0 } });
      }
    }
  },

  quitToMenu: () => {
    connectTicket++;
    if (session) {
      const oldSession = session;
      session = null;
      try {
        oldSession.room.leave();
      } catch {
        /* noop */
      }
    }
    liveArena = null;
    set({ screen: "menu", online: false, paused: false, activeDailyId: null, hud: emptyHud, feedback: null, net: emptyNet });
  },

  setPaused: (paused) => set((s) => {
    if (s.online || s.screen !== "game") return s.paused ? { paused: false } : s;
    return { paused };
  }),
  togglePaused: () => set((s) => {
    if (s.online || s.screen !== "game") return s.paused ? { paused: false } : s;
    return { paused: !s.paused };
  }),
  setMode: (id) => set({ modeId: id }),
  setPlayerCount: (n) => set({ playerCount: n }),
  toggleSound: () => set((s) => {
    const settings = { ...s.settings, sound: !s.settings.sound };
    saveSettings(settings);
    return { settings };
  }),
  setSfxVolume: (volume) => set((s) => {
    const settings = { ...s.settings, sfxVolume: clamp01(volume, s.settings.sfxVolume) };
    saveSettings(settings);
    return { settings };
  }),
  toggleHaptics: () => set((s) => {
    const settings = { ...s.settings, haptics: !s.settings.haptics };
    saveSettings(settings);
    return { settings };
  }),
  toggleColorAssist: () => set((s) => {
    const settings = { ...s.settings, colorAssist: !s.settings.colorAssist };
    saveSettings(settings);
    return { settings };
  }),
  setMotion: (mode) => set((s) => {
    const settings = { ...s.settings, motion: mode };
    saveSettings(settings);
    return { settings };
  }),
  setQuality: (q) => set((s) => {
    const settings = { ...s.settings, quality: q };
    saveSettings(settings);
    return { settings };
  }),
  setBotDifficulty: (difficulty) => set((s) => {
    const settings = { ...s.settings, botDifficulty: difficulty };
    saveSettings(settings);
    return { settings };
  }),
  unlockTrail: (id) => set((s) => {
    const progression = unlockTrail(s.progression, id);
    saveProgression(progression);
    return { progression };
  }),
  selectTrail: (id) => set((s) => {
    const progression = selectTrail(s.progression, id);
    saveProgression(progression);
    return { progression };
  }),
  claimMatchReward: (hud) => set((s) => {
    if (s.online || hud.phase !== "matchEnd" || s.lastReward?.runId === s.runId) return s;
    const human = hud.players.find((p) => p.id === hud.humanId);
    if (!human) return s;
    const ranked = rankPlayersForResults(hud.modeKind, hud.players, hud.winnerId);
    const humanResult = ranked.find((entry) => entry.player.id === hud.humanId);
    if (!humanResult) return s;
    const daily = s.activeDailyId === s.dailyChallenge.id ? s.dailyChallenge : null;
    const reward = rewardForMatch({
      won: humanResult.isWinner,
      placement: humanResult.placement,
      score: resultScoreForPlayer(hud.modeKind, hud.players, human),
      daily,
      dailyAlreadyCompleted: daily ? s.progression.dailyCompleted.includes(daily.id) : true,
    });
    const progression = applyReward(s.progression, reward, daily?.id ?? null);
    saveProgression(progression);
    return {
      progression,
      lastReward: { ...reward, runId: s.runId, dailyId: daily?.id ?? null },
    };
  }),
  pushHud: (hud) => {
    if (hud.tutorialComplete) saveTutorialComplete();
    set({ hud });
  },
  pushFeedback: (feedback) => {
    if (!feedback) return;
    set({ feedback: { ...feedback, id: ++feedbackId } });
  },
  clearFeedback: (id) => set((s) => (s.feedback?.id === id ? { feedback: null } : s)),
}));
