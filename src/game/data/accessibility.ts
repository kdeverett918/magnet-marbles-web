export type MotionMode = "auto" | "reduced" | "full";

export const MOTION_MODES: MotionMode[] = ["auto", "reduced", "full"];

export function isMotionMode(value: unknown): value is MotionMode {
  return typeof value === "string" && (MOTION_MODES as string[]).includes(value);
}

export function resolveReducedMotion(mode: MotionMode, osPrefersReduced: boolean): boolean {
  if (mode === "reduced") return true;
  if (mode === "full") return false;
  return osPrefersReduced;
}
