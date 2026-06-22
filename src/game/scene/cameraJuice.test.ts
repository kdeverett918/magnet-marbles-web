import { describe, expect, it } from "vitest";
import { addCameraImpulse, cameraImpulseForEvent, cameraShakeOffset, type CameraShakeState } from "./cameraJuice";

describe("cameraJuice", () => {
  it("keeps tiny pickups stable while emphasizing major impacts", () => {
    expect(cameraImpulseForEvent({ kind: "pickup", x: 0, z: 0, color: "#fff" })).toBe(0);
    expect(cameraImpulseForEvent({ kind: "cluster", x: 0, z: 0, color: "#fff", count: 10 })).toBe(0);
    expect(cameraImpulseForEvent({ kind: "hit", x: 0, z: 0 })).toBeGreaterThan(0);
    expect(cameraImpulseForEvent({ kind: "knockoff", x: 0, z: 0 })).toBeGreaterThan(
      cameraImpulseForEvent({ kind: "bank", x: 0, z: 0, color: "#fff", big: false })
    );
  });

  it("adds bounded shake impulses and fades them out", () => {
    const state: CameraShakeState = { time: 0, duration: 0, amplitude: 0, phase: 0 };
    addCameraImpulse(state, { kind: "bank", x: 2, z: -1, color: "#fff", big: true }, 12);

    expect(state.duration).toBeGreaterThan(0);
    expect(state.amplitude).toBeGreaterThan(0);
    expect(state.amplitude).toBeLessThanOrEqual(0.72);

    const first = cameraShakeOffset(state, 1 / 60);
    expect(Math.hypot(first.x, first.z)).toBeGreaterThan(0);

    for (let i = 0; i < 60; i++) cameraShakeOffset(state, 1 / 60);
    const done = cameraShakeOffset(state, 1 / 60);
    expect(done).toEqual({ x: 0, z: 0 });
  });

  it("stacks repeated impacts without exceeding the readability cap", () => {
    const state: CameraShakeState = { time: 0, duration: 0, amplitude: 0, phase: 0 };
    addCameraImpulse(state, { kind: "knockoff", x: 0, z: 0 }, 1);
    cameraShakeOffset(state, 1 / 60);
    addCameraImpulse(state, { kind: "steal", x: 1, z: 1, color: "#f44" }, 1.1);

    expect(state.amplitude).toBeGreaterThan(0.3);
    expect(state.amplitude).toBeLessThanOrEqual(0.72);
  });
});
