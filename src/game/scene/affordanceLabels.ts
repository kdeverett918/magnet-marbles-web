import { POWERUP_META } from "../data/config";
import type { PowerupType } from "../data/types";

export type ObstacleAffordanceId = "goalButton" | "autoGoalRing";

export type AffordanceLabel = {
  label: string;
  detail: string;
};

export const OBSTACLE_AFFORDANCE: Record<ObstacleAffordanceId, AffordanceLabel> = {
  goalButton: {
    label: "BLOCK",
    detail: "Press to block a rival goal",
  },
  autoGoalRing: {
    label: "AUTO",
    detail: "Auto-bank ring",
  },
};

export function pickupAffordanceLabel(type: PowerupType): AffordanceLabel {
  const meta = POWERUP_META[type];
  return {
    label: meta.short.toUpperCase(),
    detail: meta.desc,
  };
}

export function badgeWidthFor(label: string): number {
  return Math.max(0.95, Math.min(1.65, 0.34 + label.length * 0.2));
}
