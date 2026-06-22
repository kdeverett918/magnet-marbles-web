import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION,
  applyReward,
  dailyChallengeFor,
  normalizeProgression,
  rewardForMatch,
  selectTrail,
  unlockTrail,
} from "./progression";

describe("progression", () => {
  it("creates a deterministic daily challenge for a UTC day", () => {
    const a = dailyChallengeFor(new Date("2026-06-21T02:00:00Z"));
    const b = dailyChallengeFor(new Date("2026-06-21T23:59:00Z"));
    const next = dailyChallengeFor(new Date("2026-06-22T00:00:00Z"));

    expect(a).toEqual(b);
    expect(a.id).toBe("2026-06-21");
    expect(next.id).toBe("2026-06-22");
    expect(a.seed).not.toBe(next.seed);
  });

  it("awards a daily bonus only for the first daily win", () => {
    const daily = dailyChallengeFor(new Date("2026-06-21T12:00:00Z"));
    const first = rewardForMatch({
      won: true,
      placement: 1,
      score: 30,
      daily,
      dailyAlreadyCompleted: false,
    });
    const afterFirst = applyReward(DEFAULT_PROGRESSION, first, daily.id);
    const repeat = rewardForMatch({
      won: true,
      placement: 1,
      score: 30,
      daily,
      dailyAlreadyCompleted: afterFirst.dailyCompleted.includes(daily.id),
    });
    const afterRepeat = applyReward(afterFirst, repeat, daily.id);

    expect(first.dailyCompleted).toBe(true);
    expect(first.stars).toBe(1 + 2 + 1 + daily.rewardStars);
    expect(afterFirst.dailyCompleted).toEqual([daily.id]);
    expect(repeat.dailyCompleted).toBe(false);
    expect(afterRepeat.dailyCompleted).toEqual([daily.id]);
  });

  it("spends stars to unlock and select marble skin/trail cosmetics safely", () => {
    const withStars = normalizeProgression({ ...DEFAULT_PROGRESSION, stars: 8, totalStarsEarned: 8 });
    const unlocked = unlockTrail(withStars, "gold");
    const selected = selectTrail(unlocked, "comet");
    const rejected = unlockTrail(selected, "royal");

    expect(unlocked.selectedTrail).toBe("gold");
    expect(unlocked.unlockedTrails).toContain("gold");
    expect(unlocked.stars).toBe(0);
    expect(selected.selectedTrail).toBe("comet");
    expect(rejected.unlockedTrails).not.toContain("royal");
  });
});
