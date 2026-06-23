import type { FxEvent } from "../data/types";

export type HapticPattern = number | number[];
export type TouchHaptic = "press" | "dash" | "magnet";

export const HAPTIC_PREVIEW_PATTERN: HapticPattern = [8, 18, 12, 30, 18];

const TOUCH_PATTERNS: Record<TouchHaptic, HapticPattern> = {
  press: 8,
  dash: [10, 18, 12],
  magnet: 6,
};

export function hapticPatternForEvent(ev: FxEvent): HapticPattern | null {
  switch (ev.kind) {
    case "pickup":
      return 7;
    case "cluster":
      return ev.count >= 10 ? [9, 16, 14] : [8, 12, 8];
    case "bank":
      return ev.big ? [20, 35, 28] : [14, 26, 18];
    case "bankStreak":
      return ev.bonus >= 2 ? [14, 18, 14, 26, 22] : [12, 18, 16, 18];
    case "hit":
      return 18;
    case "steal":
      return [12, 24, 18];
    case "knockoff":
      return [28, 38, 32];
    case "paint":
      return [8, 18, 10];
    case "powerup":
      if (ev.type === "heavyCore") return [18, 22, 18];
      if (ev.type === "shockPulse") return [10, 16, 24];
      return [10, 18, 12];
    case "fall":
      return [24, 38, 20];
  }
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

class HapticsEngine {
  private enabled = true;
  private lastPulseAt = -Infinity;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.cancel();
  }

  supported() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  cancel() {
    if (this.supported()) navigator.vibrate(0);
  }

  pulse(pattern: HapticPattern, minGapMs = 42) {
    if (!this.enabled || !this.supported()) return false;
    const t = nowMs();
    if (t - this.lastPulseAt < minGapMs) return false;
    this.lastPulseAt = t;
    return navigator.vibrate(pattern);
  }

  tap(kind: TouchHaptic) {
    return this.pulse(TOUCH_PATTERNS[kind], kind === "magnet" ? 80 : 36);
  }

  play(ev: FxEvent) {
    const pattern = hapticPatternForEvent(ev);
    if (pattern === null) return false;
    const minGap = ev.kind === "pickup" ? 52 : 36;
    return this.pulse(pattern, minGap);
  }

  preview() {
    return this.pulse(HAPTIC_PREVIEW_PATTERN, 80);
  }
}

export const haptics = new HapticsEngine();
