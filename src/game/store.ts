import { create } from "zustand";
import type { PowerupType, RoundPhase } from "./data/types";
import { World, makeWorld } from "./sim/world";

export interface PlayerHud {
  id: number;
  name: string;
  colorHex: string;
  score: number;
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
  players: PlayerHud[];
  heldPowerup: PowerupType | null;
  activePowerups: { type: PowerupType; remaining: number }[];
  dashCooldown: number;
  magnetActive: boolean;
  clusterCap: number;
}

interface Settings {
  sound: boolean;
  quality: "high" | "lite";
}

interface GameStore {
  screen: "menu" | "game";
  modeId: string;
  playerCount: number;
  settings: Settings;
  hud: Hud;
  // imperative: the live sim lives outside React state to avoid re-renders
  startGame: (modeId: string, playerCount: number) => void;
  quitToMenu: () => void;
  setMode: (id: string) => void;
  setPlayerCount: (n: number) => void;
  toggleSound: () => void;
  setQuality: (q: "high" | "lite") => void;
  pushHud: (hud: Hud) => void;
}

const emptyHud: Hud = {
  phase: "menu",
  round: 1,
  totalRounds: 3,
  roundTime: 0,
  introCountdown: 0,
  suddenDeath: false,
  winnerId: -1,
  players: [],
  heldPowerup: null,
  activePowerups: [],
  dashCooldown: 0,
  magnetActive: false,
  clusterCap: 18,
};

// The single live world instance, held outside React.
let liveWorld: World | null = null;
export const getWorld = () => liveWorld;

export const useGame = create<GameStore>((set) => ({
  screen: "menu",
  modeId: "classic",
  playerCount: 4,
  settings: { sound: true, quality: "high" },
  hud: emptyHud,
  startGame: (modeId, playerCount) => {
    liveWorld = makeWorld(modeId, playerCount, (Math.random() * 1e9) | 0);
    liveWorld.startMatch();
    set({ screen: "game", modeId, playerCount });
  },
  quitToMenu: () => {
    liveWorld = null;
    set({ screen: "menu", hud: emptyHud });
  },
  setMode: (id) => set({ modeId: id }),
  setPlayerCount: (n) => set({ playerCount: n }),
  toggleSound: () => set((s) => ({ settings: { ...s.settings, sound: !s.settings.sound } })),
  setQuality: (q) => set((s) => ({ settings: { ...s.settings, quality: q } })),
  pushHud: (hud) => set({ hud }),
}));
