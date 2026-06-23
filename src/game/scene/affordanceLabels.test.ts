import { describe, expect, it } from "vitest";
import { POWERUP_META } from "../data/config";
import { OBSTACLE_AFFORDANCE, badgeWidthFor, pickupAffordanceLabel } from "./affordanceLabels";

describe("scene affordance labels", () => {
  it("gives the launch powerups short, distinct pre-pickup labels", () => {
    const labels = (["magnetBurst", "shockPulse", "heavyCore"] as const).map((type) => pickupAffordanceLabel(type));

    expect(labels.map((item) => item.label)).toEqual(["MAG", "PULSE", "HEAVY"]);
    expect(new Set(labels.map((item) => item.label)).size).toBe(labels.length);
    for (const item of labels) {
      expect(item.label.length).toBeLessThanOrEqual(5);
      expect(item.detail.length).toBeGreaterThan(8);
    }
  });

  it("keeps every powerup badge readable and sourced from metadata", () => {
    for (const type of Object.keys(POWERUP_META) as (keyof typeof POWERUP_META)[]) {
      const label = pickupAffordanceLabel(type);

      expect(label.label).toBe(POWERUP_META[type].short.toUpperCase());
      expect(label.label.length).toBeLessThanOrEqual(6);
      expect(badgeWidthFor(label.label)).toBeGreaterThanOrEqual(0.95);
      expect(badgeWidthFor(label.label)).toBeLessThanOrEqual(1.65);
    }
  });

  it("labels arena obstacles before players touch them", () => {
    expect(OBSTACLE_AFFORDANCE.goalButton).toEqual({
      label: "BLOCK",
      detail: "Press to block a rival goal",
    });
    expect(OBSTACLE_AFFORDANCE.autoGoalRing).toEqual({
      label: "AUTO",
      detail: "Auto-bank ring",
    });
  });
});
