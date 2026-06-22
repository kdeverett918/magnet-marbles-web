import { describe, expect, it } from "vitest";
import { clampedStickVector, rightGestureShouldDash, type TouchPoint } from "./touchGestures";

const start: TouchPoint = { x: 100, y: 100, t: 1000 };

describe("touch gesture helpers", () => {
  it("treats a quick right-side tap as a dash request", () => {
    expect(rightGestureShouldDash(start, { x: 102, y: 101, t: 1180 }, true)).toBe(true);
  });

  it("does not dash on a deliberate magnet hold without a flick", () => {
    expect(rightGestureShouldDash(start, { x: 104, y: 102, t: 1500 }, true)).toBe(false);
  });

  it("treats a longer right-side flick as a dash request", () => {
    expect(rightGestureShouldDash(start, { x: 152, y: 116, t: 1500 }, true)).toBe(true);
  });

  it("respects canceled gestures and dash cooldown", () => {
    expect(rightGestureShouldDash(start, { x: 152, y: 116, t: 1500 }, true, true)).toBe(false);
    expect(rightGestureShouldDash(start, { x: 102, y: 101, t: 1180 }, false)).toBe(false);
  });

  it("clamps drag vectors to the joystick radius while preserving direction", () => {
    const vector = clampedStickVector({ x: 0, y: 0 }, { x: 120, y: -120 }, 60);

    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(60, 4);
    expect(Math.hypot(vector.nx, vector.ny)).toBeCloseTo(1, 4);
    expect(vector.nx).toBeGreaterThan(0.7);
    expect(vector.ny).toBeLessThan(-0.7);
  });
});
