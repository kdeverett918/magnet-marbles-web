import { create } from "zustand";
import type { PowerupType, RoundPhase } from "./data/types";
import { makeWorld } from "./sim/world";
import type { Arena } from "./sim/arena";
import { connect, type NetSession } from "./net/client";

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
  humanId: number;
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

export type NetStatus = "idle" | "connecting" | "connected" | "error";

interface GameStore {
  screen: "menu" | "game";
  online: boolean;
  modeId: string;
  playerCount: number;
  settings: Settings;
  hud: Hud;
  net: { status: NetStatus; roomId: string; error: string };
  startGame: (modeId: string, playerCount: number) => void;
  startOnline: (modeId: string, roomCode?: string) => Promise<void>;
  quitToMenu: () => void;
  setMode: (id: string) => void;
  setPlayerCount: (n: number) => void;
  toggleSound: () => void;
  setQuality: (q: "high" | "lite") => void;
  pushHud: (hud: Hud) => void;
}

const emptyHud: Hud = {
  phase: "menu", round: 1, totalRounds: 3, roundTime: 0, introCountdown: 0,
  suddenDeath: false, winnerId: -1, humanId: 0, players: [],
  heldPowerup: null, activePowerups: [], dashCooldown: 0, magnetActive: false, clusterCap: 18,
};

// The single live arena (local World or networked NetView), held outside React.
let liveArena: Arena | null = null;
let session: NetSession | null = null;
export const getWorld = (): Arena | null => liveArena;

export const useGame = create<GameStore>((set) => ({
  screen: "menu",
  online: false,
  modeId: "classic",
  playerCount: 4,
  settings: { sound: true, quality: "high" },
  hud: emptyHud,
  net: { status: "idle", roomId: "", error: "" },

  startGame: (modeId, playerCount) => {
    const w = makeWorld(modeId, playerCount, (Math.random() * 1e9) | 0);
    w.startMatch();
    liveArena = w;
    session = null;
    set({ screen: "game", online: false, modeId, playerCount });
  },

  startOnline: async (modeId, roomCode) => {
    set({ net: { status: "connecting", roomId: "", error: "" } });
    try {
      const s = await connect({ mode: modeId, roomCode });
      session = s;
      liveArena = s.view;
      s.room.onLeave(() => {
        set((st) => (st.online ? { ...st, net: { ...st.net, status: "error", error: "Disconnected" } } : st));
      });
      set({ screen: "game", online: true, modeId, net: { status: "connected", roomId: s.roomId, error: "" } });
    } catch (e: any) {
      set({ net: { status: "error", roomId: "", error: e?.message || "Could not connect to server" } });
    }
  },

  quitToMenu: () => {
    if (session) {
      try {
        session.room.leave();
      } catch {
        /* noop */
      }
    }
    session = null;
    liveArena = null;
    set({ screen: "menu", online: false, hud: emptyHud, net: { status: "idle", roomId: "", error: "" } });
  },

  setMode: (id) => set({ modeId: id }),
  setPlayerCount: (n) => set({ playerCount: n }),
  toggleSound: () => set((s) => ({ settings: { ...s.settings, sound: !s.settings.sound } })),
  setQuality: (q) => set((s) => ({ settings: { ...s.settings, quality: q } })),
  pushHud: (hud) => set({ hud }),
}));
