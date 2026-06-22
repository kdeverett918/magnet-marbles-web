import { create } from "zustand";
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
  quality: "high" | "lite";
}

const SETTINGS_KEY = "magnet-marbles:settings:v1";
const TUTORIAL_KEY = "magnet-marbles:tutorial-complete:v1";
const DEFAULT_SETTINGS: Settings = { sound: true, quality: "high" };

function defaultSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth <= 760;
  const lowMemory = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory) <= 4
    : false;
  return {
    sound: true,
    quality: coarsePointer || narrowViewport || lowMemory ? "lite" : "high",
  };
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
      quality: parsed.quality === "lite" || parsed.quality === "high" ? parsed.quality : defaults.quality,
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
  modeId: string;
  playerCount: number;
  settings: Settings;
  progression: ProgressionState;
  dailyChallenge: DailyChallenge;
  activeDailyId: string | null;
  runId: number;
  lastReward: RewardSummary | null;
  hud: Hud;
  net: NetState;
  startGame: (modeId: string, playerCount: number) => void;
  startDailyChallenge: () => void;
  startOnline: (modeId: string, roomCode?: string) => Promise<void>;
  quitToMenu: () => void;
  setMode: (id: string) => void;
  setPlayerCount: (n: number) => void;
  toggleSound: () => void;
  setQuality: (q: "high" | "lite") => void;
  unlockTrail: (id: string) => void;
  selectTrail: (id: string) => void;
  claimMatchReward: (hud: Hud) => void;
  pushHud: (hud: Hud) => void;
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
export const getWorld = (): Arena | null => liveArena;

export const useGame = create<GameStore>((set) => ({
  screen: "menu",
  online: false,
  modeId: "classic",
  playerCount: 4,
  settings: loadSettings(),
  progression: loadProgression(),
  dailyChallenge: dailyChallengeFor(),
  activeDailyId: null,
  runId: 0,
  lastReward: null,
  hud: emptyHud,
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
    const w = makeWorld(modeId, playerCount, (Math.random() * 1e9) | 0, { tutorialAssist: !tutorialComplete() });
    w.startMatch();
    liveArena = w;
    set((s) => ({
      screen: "game",
      online: false,
      modeId,
      playerCount,
      activeDailyId: null,
      runId: s.runId + 1,
      lastReward: null,
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
    const w = makeWorld(daily.modeId, daily.playerCount, daily.seed, { tutorialAssist: false });
    w.startMatch();
    liveArena = w;
    set((s) => ({
      screen: "game",
      online: false,
      modeId: daily.modeId,
      playerCount: daily.playerCount,
      dailyChallenge: daily,
      activeDailyId: daily.id,
      runId: s.runId + 1,
      lastReward: null,
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
    set({ online: false, modeId, activeDailyId: null, lastReward: null, net: { status: "connecting", roomId: "", error: "", startedAt: Date.now() } });
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
        modeId,
        runId: st.runId + 1,
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
    set({ screen: "menu", online: false, activeDailyId: null, hud: emptyHud, net: emptyNet });
  },

  setMode: (id) => set({ modeId: id }),
  setPlayerCount: (n) => set({ playerCount: n }),
  toggleSound: () => set((s) => {
    const settings = { ...s.settings, sound: !s.settings.sound };
    saveSettings(settings);
    return { settings };
  }),
  setQuality: (q) => set((s) => {
    const settings = { ...s.settings, quality: q };
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
    const sorted = [...hud.players].sort((a, b) => b.score - a.score);
    const humanIndex = sorted.findIndex((p) => p.id === hud.humanId);
    const human = hud.players.find((p) => p.id === hud.humanId);
    if (humanIndex < 0 || !human) return s;
    const daily = s.activeDailyId === s.dailyChallenge.id ? s.dailyChallenge : null;
    const reward = rewardForMatch({
      won: humanIndex === 0,
      placement: humanIndex + 1,
      score: human.score,
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
}));
