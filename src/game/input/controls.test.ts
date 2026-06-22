import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEdges,
  drag,
  endDrag,
  input,
  resetInputForTests,
  setDragTarget,
  setTouchMagnetHeld,
  setTouchMove,
  triggerActivate,
  triggerDash,
} from "./controls";

describe("shared input state", () => {
  beforeEach(() => resetInputForTests());

  it("uses touch movement while active and clears back to neutral on release", () => {
    setTouchMove(0.6, -0.4, true);

    expect(input.moveX).toBeCloseTo(0.6);
    expect(input.moveZ).toBeCloseTo(-0.4);

    setTouchMove(0, 0, false);

    expect(input.moveX).toBe(0);
    expect(input.moveZ).toBe(0);
  });

  it("keeps held magnet state separate from edge-triggered actions", () => {
    setTouchMagnetHeld(true);
    triggerDash();
    triggerActivate();

    clearEdges();

    expect(input.magnet).toBe(true);
    expect(input.dash).toBe(false);
    expect(input.activate).toBe(false);
  });

  it("tracks direct-drag targets and ends drag cleanly", () => {
    setDragTarget(3, -2);

    expect(drag).toEqual({ active: true, x: 3, z: -2 });
    expect(input.dash).toBe(false);

    setDragTarget(4, -3);

    expect(drag).toEqual({ active: true, x: 4, z: -3 });
    expect(input.dash).toBe(false);

    endDrag();

    expect(drag.active).toBe(false);
    expect(input.moveX).toBe(0);
    expect(input.moveZ).toBe(0);
  });
});
