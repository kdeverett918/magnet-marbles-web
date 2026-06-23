import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION,
  applyReward,
  dailyChallengeFor,
  dailyStreakFor,
  modeRecordFor,
  nextUnlockFor,
  normalizeProgression,
  recordMatch,
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
    expect(afterFirst.dailyStreak).toEqual({ current: 1, best: 1, lastCompleted: daily.id });
    expect(repeat.dailyCompleted).toBe(false);
    expect(afterRepeat.dailyCompleted).toEqual([daily.id]);
    expect(afterRepeat.dailyStreak).toEqual(afterFirst.dailyStreak);
  });

  it("tracks daily challenge streaks by UTC daily id", () => {
    const dayOne = dailyChallengeFor(new Date("2026-06-21T12:00:00Z"));
    const dayTwo = dailyChallengeFor(new Date("2026-06-22T12:00:00Z"));
    const dayFour = dailyChallengeFor(new Date("2026-06-24T12:00:00Z"));
    const dailyWin = (daily: typeof dayOne) => rewardForMatch({
      won: true,
      placement: 1,
      score: 26,
      daily,
      dailyAlreadyCompleted: false,
    });

    expect(dailyStreakFor(DEFAULT_PROGRESSION, dayOne)).toMatchObject({
      current: 0,
      best: 0,
      next: 1,
      completedToday: false,
    });

    const afterOne = applyReward(DEFAULT_PROGRESSION, dailyWin(dayOne), dayOne.id);
    expect(dailyStreakFor(afterOne, dayOne)).toMatchObject({
      current: 1,
      best: 1,
      next: 1,
      completedToday: true,
    });

    const afterTwo = applyReward(afterOne, dailyWin(dayTwo), dayTwo.id);
    expect(afterTwo.dailyStreak).toEqual({ current: 2, best: 2, lastCompleted: dayTwo.id });

    const afterGap = applyReward(afterTwo, dailyWin(dayFour), dayFour.id);
    expect(afterGap.dailyStreak).toEqual({ current: 1, best: 2, lastCompleted: dayFour.id });
    expect(dailyStreakFor(afterGap, dayFour)).toMatchObject({
      current: 1,
      best: 2,
      next: 1,
      completedToday: true,
    });
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

  it("summarizes the next cosmetic unlock target", () => {
    expect(nextUnlockFor(DEFAULT_PROGRESSION)).toMatchObject({
      trail: { id: "candy", name: "Candy Rift" },
      starsNeeded: 4,
      ready: false,
    });

    const ready = normalizeProgression({ ...DEFAULT_PROGRESSION, stars: 4, totalStarsEarned: 4 });
    expect(nextUnlockFor(ready)).toMatchObject({
      trail: { id: "candy" },
      starsNeeded: 0,
      ready: true,
    });

    const withCandy = normalizeProgression({
      ...DEFAULT_PROGRESSION,
      stars: 3,
      totalStarsEarned: 7,
      unlockedTrails: ["comet", "candy"],
    });
    expect(nextUnlockFor(withCandy)).toMatchObject({
      trail: { id: "gold", name: "Gold Rush" },
      starsNeeded: 5,
      ready: false,
    });

    const complete = normalizeProgression({
      ...DEFAULT_PROGRESSION,
      unlockedTrails: ["comet", "candy", "gold", "mint", "violet", "royal"],
    });
    expect(nextUnlockFor(complete)).toBeNull();
  });

  it("tracks sanitized local records per mode", () => {
    const normalized = normalizeProgression({
      ...DEFAULT_PROGRESSION,
      records: {
        classic: { bestScore: 12.8, wins: "2", matches: Number.NaN },
        battle: { bestScore: -20, wins: -1, matches: 3 },
      },
    });

    expect(modeRecordFor(normalized, "classic")).toEqual({ bestScore: 12, wins: 2, matches: 0 });
    expect(modeRecordFor(normalized, "survival")).toEqual({ bestScore: 0, wins: 0, matches: 0 });

    const first = recordMatch(normalized, { modeId: "classic", score: 18, won: true });
    expect(first.previous).toEqual({ bestScore: 12, wins: 2, matches: 0 });
    expect(first.record).toEqual({ bestScore: 18, wins: 3, matches: 1 });
    expect(first.isNewBest).toBe(true);

    const second = recordMatch(first.progression, { modeId: "classic", score: 14, won: false });
    expect(second.record).toEqual({ bestScore: 18, wins: 3, matches: 2 });
    expect(second.isNewBest).toBe(false);
  });
});
