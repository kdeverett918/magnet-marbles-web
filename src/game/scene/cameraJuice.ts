import type { FxEvent } from "../data/types";

export interface CameraShakeState {
  time: number;
  duration: number;
  amplitude: number;
  phase: number;
}

// Gentle, sparse "kick" only on the readable combat/scoring moments; tiny
// pickups stay rock-still so the table remains legible on phone screens.
export function cameraImpulseForEvent(ev: FxEvent) {
  switch (ev.kind) {
    case "pickup":
    case "cluster":
      return 0;
    case "hit":
      return 0.07;
    case "bank":
      return ev.big ? 0.22 : 0.09;
    case "bankStreak":
      return 0.1 + ev.bonus * 0.03;
    case "steal":
      return 0.3;
    case "knockoff":
      return 0.36;
    case "paint":
      return 0.08;
    case "powerup":
      if (ev.type === "shockPulse") return 0.16;
      return 0;
    case "fall":
      return 0.14;
  }
}

export function addCameraImpulse(state: CameraShakeState, ev: FxEvent, simTime: number) {
  const impulse = cameraImpulseForEvent(ev);
  if (impulse <= 0) return;
  const carry = state.time < state.duration ? state.amplitude * (1 - state.time / state.duration) * 0.3 : 0;
  state.time = 0;
  state.duration = Math.min(0.34, 0.12 + impulse * 0.28);
  state.amplitude = Math.min(0.42, impulse + carry);
  state.phase = (simTime * 19.37 + ev.x * 0.73 + ev.z * 1.41) % (Math.PI * 2);
}

export function cameraShakeOffset(state: CameraShakeState, dt: number) {
  if (state.time >= state.duration || state.amplitude <= 0) return { x: 0, z: 0 };
  state.time = Math.min(state.time + dt, state.duration);
  const t = state.duration > 0 ? state.time / state.duration : 1;
  const fade = Math.pow(1 - t, 2);
  if (fade <= 0) {
    state.amplitude = 0;
    return { x: 0, z: 0 };
  }
  const x = Math.sin(state.phase + state.time * 58) * state.amplitude * fade;
  const z = Math.cos(state.phase * 0.7 + state.time * 47) * state.amplitude * fade * 0.55;
  return { x, z };
}
