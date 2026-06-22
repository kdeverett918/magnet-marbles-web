export interface TouchPoint {
  x: number;
  y: number;
  t: number;
}

export interface GestureThresholds {
  quickDashMs: number;
  flickDashDistance: number;
}

export const TOUCH_GESTURE_THRESHOLDS: GestureThresholds = {
  quickDashMs: 240,
  flickDashDistance: 34,
};

export function clampedStickVector(
  origin: Pick<TouchPoint, "x" | "y">,
  current: Pick<TouchPoint, "x" | "y">,
  radius: number,
) {
  let dx = current.x - origin.x;
  let dy = current.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > radius) {
    dx = (dx / distance) * radius;
    dy = (dy / distance) * radius;
  }
  return {
    x: dx,
    y: dy,
    nx: dx / radius,
    ny: dy / radius,
  };
}

export function rightGestureShouldDash(
  start: TouchPoint,
  end: Pick<TouchPoint, "x" | "y" | "t">,
  dashReady: boolean,
  canceled = false,
  thresholds = TOUCH_GESTURE_THRESHOLDS,
) {
  if (canceled || !dashReady) return false;
  const elapsed = end.t - start.t;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return elapsed <= thresholds.quickDashMs || distance >= thresholds.flickDashDistance;
}
