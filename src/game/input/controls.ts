// Shared input state for the human player (slot 0). Written by keyboard
// listeners and the on-screen touch controls; read each frame by the game loop.

export interface InputState {
  moveX: number; // world +X
  moveZ: number; // world +Z (toward camera). "Up"/forward is negative.
  magnet: boolean;
  dash: boolean; // edge-triggered each press
  activate: boolean; // edge-triggered each press
}

export const input: InputState = {
  moveX: 0,
  moveZ: 0,
  magnet: false,
  dash: false,
  activate: false,
};

// keyboard sub-state (separate so touch joystick can coexist)
const keyMove = { x: 0, z: 0 };
let keyMagnet = false;

const pressed = new Set<string>();

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  return Boolean(el?.closest("button, input, select, textarea, a, [role='button'], [contenteditable='true']"));
}

function recompute() {
  let x = 0;
  let z = 0;
  if (pressed.has("KeyW") || pressed.has("ArrowUp")) z -= 1;
  if (pressed.has("KeyS") || pressed.has("ArrowDown")) z += 1;
  if (pressed.has("KeyA") || pressed.has("ArrowLeft")) x -= 1;
  if (pressed.has("KeyD") || pressed.has("ArrowRight")) x += 1;
  keyMove.x = x;
  keyMove.z = z;
  input.moveX = touchActive ? touchMove.x : keyMove.x;
  input.moveZ = touchActive ? touchMove.z : keyMove.z;
}

// touch joystick state
const touchMove = { x: 0, z: 0 };
let touchActive = false;

export function setTouchMove(x: number, z: number, active: boolean) {
  touchMove.x = x;
  touchMove.z = z;
  touchActive = active;
  if (active) {
    input.moveX = x;
    input.moveZ = z;
  } else {
    recompute();
  }
}

export function setTouchMagnet(on: boolean) {
  input.magnet = on || keyMagnet;
}

export function triggerDash() {
  input.dash = true;
}

export function triggerActivate() {
  input.activate = true;
}

// --- direct-drag steering: the marble chases a world-space point (finger/mouse) ---
export const drag = { active: false, x: 0, z: 0 };
export function setDragTarget(x: number, z: number) {
  drag.active = true;
  drag.x = x;
  drag.z = z;
}
export function endDrag() {
  drag.active = false;
  recompute(); // fall back to keyboard movement (or stop)
}

let installed = false;
export function installKeyboard(): () => void {
  if (installed) return () => undefined;
  installed = true;
  const down = (e: KeyboardEvent) => {
    if (isInteractiveTarget(e.target)) return;
    if (e.repeat) return;
    pressed.add(e.code);
    if (e.code === "Space") {
      keyMagnet = true;
      input.magnet = true;
      e.preventDefault();
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.dash = true;
    if (e.code === "KeyE" || e.code === "Enter") input.activate = true;
    recompute();
  };
  const up = (e: KeyboardEvent) => {
    pressed.delete(e.code);
    if (e.code === "Space") {
      keyMagnet = false;
      input.magnet = touchMagnetHeld;
    }
    recompute();
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    installed = false;
  };
}

// track touch magnet hold so releasing space doesn't kill a held touch magnet
let touchMagnetHeld = false;
export function setTouchMagnetHeld(on: boolean) {
  touchMagnetHeld = on;
  input.magnet = on || keyMagnet;
}

/** Called by the loop AFTER consuming, to clear edge-triggered inputs. */
export function clearEdges() {
  input.dash = false;
  input.activate = false;
}

export function resetInput() {
  pressed.clear();
  keyMove.x = 0;
  keyMove.z = 0;
  keyMagnet = false;
  touchMove.x = 0;
  touchMove.z = 0;
  touchActive = false;
  touchMagnetHeld = false;
  drag.active = false;
  drag.x = 0;
  drag.z = 0;
  input.moveX = 0;
  input.moveZ = 0;
  input.magnet = false;
  input.dash = false;
  input.activate = false;
}

export function resetInputForTests() {
  resetInput();
}
