import type { FxEvent } from "../data/types";

export interface CameraShakeState {
  time: number;
  duration: number;
  amplitude: number;
  phase: number;
}

export function cameraImpulseForEvent(ev: FxEvent) {
  switch (ev.kind) {
    case "pickup":
    case "cluster":
      return 0;
    case "bank":
      return ev.big ? 0.46 : 0.24;
    case "bankStreak":
      return 0.28 + ev.bonus * 0.08;
    case "hit":
      return 0.18;
    case "steal":
      return 0.3;
    case "knockoff":
      return 0.56;
    case "paint":
      return 0.22;
    case "powerup":
      if (ev.type === "shockPulse") return 0.34;
      if (ev.type === "heavyCore") return 0.26;
      return 0.2;
    case "fall":
      return 0.34;
  }
}

export function addCameraImpulse(state: CameraShakeState, ev: FxEvent, simTime: number) {
  const impulse = cameraImpulseForEvent(ev);
  if (impulse <= 0) return;
  const carry = state.time < state.duration ? state.amplitude * (1 - state.time / state.duration) * 0.45 : 0;
  state.time = 0;
  state.duration = Math.min(0.42, 0.16 + impulse * 0.32);
  state.amplitude = Math.min(0.72, impulse + carry);
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
