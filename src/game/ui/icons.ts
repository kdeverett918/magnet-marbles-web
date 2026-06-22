import type { PowerupType } from "../data/types";

export const PU_ICON: Record<PowerupType, string> = {
  magnetBurst: "🧲",
  shockPulse: "↯",
  heavyCore: "●",
  superMagnet: "🧲",
  doubleScore: "✦",
  plusFive: "＋",
  turbo: "⚡",
  disableMagnet: "⛔",
  paint: "🎨",
};

export const PU_LABEL: Record<PowerupType, string> = {
  magnetBurst: "BURST",
  shockPulse: "PULSE",
  heavyCore: "HEAVY",
  superMagnet: "SUPER MAGNET",
  doubleScore: "DOUBLE",
  plusFive: "PLUS 5",
  turbo: "TURBO",
  disableMagnet: "JAM",
  paint: "PAINT",
};
