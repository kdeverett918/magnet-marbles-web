import { describe, expect, it } from "vitest";
import { HAPTIC_PREVIEW_PATTERN, hapticPatternForEvent } from "./haptics";

describe("hapticPatternForEvent", () => {
  it("maps frequent collection feedback to short phone-safe pulses", () => {
    expect(hapticPatternForEvent({ kind: "pickup", x: 0, z: 0, color: "#fff" })).toBe(7);
    expect(hapticPatternForEvent({ kind: "cluster", x: 0, z: 0, color: "#fff", count: 6 })).toEqual([8, 12, 8]);
    expect(hapticPatternForEvent({ kind: "cluster", x: 0, z: 0, color: "#fff", count: 10 })).toEqual([9, 16, 14]);
    expect(hapticPatternForEvent({ kind: "hit", x: 0, z: 0 })).toBe(18);
  });

  it("uses stronger multi-pulse patterns for scoring, steals, and falls", () => {
    expect(hapticPatternForEvent({ kind: "bank", x: 0, z: 0, color: "#fff", big: false })).toEqual([14, 26, 18]);
    expect(hapticPatternForEvent({ kind: "bank", x: 0, z: 0, color: "#fff", big: true })).toEqual([20, 35, 28]);
    expect(hapticPatternForEvent({ kind: "steal", x: 0, z: 0, color: "#fff" })).toEqual([12, 24, 18]);
    expect(hapticPatternForEvent({ kind: "fall", x: 0, z: 0 })).toEqual([24, 38, 20]);
  });

  it("gives launch powerups distinct tactile identities", () => {
    expect(hapticPatternForEvent({ kind: "powerup", x: 0, z: 0, type: "magnetBurst" })).toEqual([10, 18, 12]);
    expect(hapticPatternForEvent({ kind: "powerup", x: 0, z: 0, type: "shockPulse" })).toEqual([10, 16, 24]);
    expect(hapticPatternForEvent({ kind: "powerup", x: 0, z: 0, type: "heavyCore" })).toEqual([18, 22, 18]);
  });

  it("provides a distinct phone-safe haptic preview pattern", () => {
    expect(HAPTIC_PREVIEW_PATTERN).toEqual([8, 18, 12, 30, 18]);
  });
});
