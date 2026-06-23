import type { FxEvent } from "../data/types";

export interface CameraShakeState {
  time: number;
  duration: number;
  amplitude: number;
  phase: number;
}

// Gentle, sparse "kick" only on the big moments — the camera otherwise stays
// rock-still. Earlier values (knock-off 0.56, bank 0.46) jolted the whole view
// on routine hits/steals during a 4-player scrum and read as "shaky".
export function cameraImpulseForEvent(ev: FxEvent) {
  switch (ev.kind) {
    case "pickup":
    case "cluster":
    case "hit":
      return 0; // routine, very frequent — no shake
    case "bank":
      return ev.big ? 0.16 : 0;
    case "bankStreak":
      return 0.1 + ev.bonus * 0.03;
    case "steal":
      return 0.1;
    case "knockoff":
      return 0.2;
    case "paint":
      return 0.08;
    case "powerup":
      if (ev.type === "shockPulse") return 0.14;
      return 0;
    case "fall":
      return 0.12;
  }
}

export function addCameraImpulse(state: CameraShakeState, ev: FxEvent, simTime: number) {
  const impulse = cameraImpulseForEvent(ev);
  if (impulse <= 0) return;
  const carry = state.time < state.duration ? state.amplitude * (1 - state.time / state.duration) * 0.3 : 0;
  state.time = 0;
  state.duration = Math.min(0.3, 0.12 + impulse * 0.28);
  state.amplitude = Math.min(0.26, impulse + carry);
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
