import { clamp } from "./mathx";

export interface PlayerInputIntent {
  moveX: number;
  moveZ: number;
  magnet: boolean;
  dash: boolean;
  activate: boolean;
}

export function sanitizeInputIntent(input: Partial<PlayerInputIntent>): PlayerInputIntent {
  return {
    moveX: sanitizeAxis(input.moveX),
    moveZ: sanitizeAxis(input.moveZ),
    magnet: input.magnet === true,
    dash: input.dash === true,
    activate: input.activate === true,
  };
}

function sanitizeAxis(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}
