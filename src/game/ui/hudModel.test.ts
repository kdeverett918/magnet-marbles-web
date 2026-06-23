import { describe, expect, it } from "vitest";
import type { Hud, PlayerHud } from "../store";
import {
  actionStatusFor,
  carryAdviceFor,
  humanHudPlayer,
  introBriefFor,
  masteryBadgeFor,
  objectiveAnnouncementFor,
  objectiveFor,
  raceStatusFor,
  rimDangerFor,
  resultRecapFor,
  stealTargetFor,
  tutorialCoachStepsFor,
} from "./hudModel";
import type { RewardSummary } from "../store";

function player(id: number, cluster: number, lives = 3): PlayerHud {
  return {
    id,
    name: `P${id}`,
    colorHex: "#fff",
    teamId: id,
    edgeDistance: 6,
    speed: 0,
    height: 0,
    score: 0,
    lives,
    cluster,
    bankStreak: 0,
    bankStreakBonus: 0,
    bankStreakTimeLeft: 0,
    isBot: id !== 1,
    botPersonality: id === 0 ? "collector" : id === 2 ? "bruiser" : id === 3 ? "banker" : null,
    alive: lives > 0,
  };
}

function scoredPlayer(id: number, score: number, cluster = 0, lives = 3): PlayerHud {
  return { ...player(id, cluster, lives), score };
}

function hud(overrides: Partial<Hud> = {}): Hud {
  return {
    phase: "playing",
    round: 1,
    totalRounds: 3,
    roundTime: 45,
    introCountdown: 0,
    suddenDeath: false,
    winnerId: -1,
    modeId: "classic",
    modeName: "Classic",
    modeKind: "classic",
    modeObjective: "Collect marbles and bank at your goal.",
    humanId: 1,
    players: [player(0, 0), player(1, 8), player(2, 0), player(3, 0)],
    heldPowerup: null,
    activePowerups: [],
    dashCooldown: 0,
    magnetActive: false,
    clusterCap: 18,
    tutorialAssist: false,
    tutorialStep: "off",
    tutorialGoalPulse: false,
    tutorialComplete: false,
    ...overrides,
  };
}

function reward(overrides: Partial<RewardSummary> = {}): RewardSummary {
  return {
    stars: 4,
    placement: 1,
    won: true,
    dailyCompleted: false,
    reasons: ["Finished match", "1st place"],
    runId: 1,
    dailyId: null,
    dailyStreak: null,
    record: {
      modeId: "classic",
      score: 18,
      bestScore: 18,
      previousBest: 12,
      isNewBest: false,
      wins: 1,
      matches: 1,
    },
    ...overrides,
  };
}

describe("HUD model", () => {
  it("selects the actual human player instead of assuming slot zero", () => {
    const state = hud();

    expect(humanHudPlayer(state)?.id).toBe(1);
    expect(objectiveFor(state, humanHudPlayer(state))).toBe("Bank now or risk a bigger haul");
  });

  it("uses the human seat for survival danger copy", () => {
    const state = hud({
      modeId: "survival",
      modeName: "Survival",
      modeKind: "survival",
      humanId: 2,
      players: [player(0, 0, 3), player(1, 0, 3), player(2, 0, 1), player(3, 0, 2)],
    });

    expect(humanHudPlayer(state)?.id).toBe(2);
    expect(objectiveFor(state, humanHudPlayer(state))).toBe("Final life: avoid the rim and use pulses defensively");
  });

  it("falls back to the first visible player if a stale human id is missing", () => {
    const state = hud({ humanId: 99, players: [player(0, 3), player(1, 0)] });

    expect(humanHudPlayer(state)?.id).toBe(0);
  });

  it("builds concise screen-reader objective announcements without timer spam", () => {
    const state = hud();
    const objective = objectiveFor(state, humanHudPlayer(state));

    expect(objectiveAnnouncementFor(state, objective)).toBe("Objective: Bank now or risk a bigger haul.");

    const intro = hud({ phase: "intro", modeName: "Battle", modeObjective: "Dash into loaded rivals to steal.", round: 2 });
    expect(objectiveAnnouncementFor(intro, objectiveFor(intro, humanHudPlayer(intro)))).toBe(
      "Objective: Battle: round starting. Battle, round 2 of 3."
    );
  });

  it("surfaces a compact first-round coach only while tutorial assist is active", () => {
    const collectState = hud({ tutorialAssist: true, tutorialStep: "collect" });
    expect(objectiveFor(collectState, humanHudPlayer(collectState))).toBe(
      "Hold magnet near candy marbles to pull them in"
    );

    const collect = tutorialCoachStepsFor(collectState);
    expect(collect.map((step) => [step.label, step.state])).toEqual([
      ["Pull", "active"],
      ["Carry", "next"],
      ["Bank", "next"],
    ]);

    const bank = tutorialCoachStepsFor(hud({ tutorialAssist: true, tutorialStep: "bank", players: [player(0, 0), player(1, 2)] }));
    expect(bank.map((step) => [step.label, step.state])).toEqual([
      ["Pull", "done"],
      ["Carry", "done"],
      ["Bank", "active"],
    ]);
    expect(bank[2].detail).toBe("Reach your goal");

    expect(tutorialCoachStepsFor(hud({ tutorialAssist: true, tutorialStep: "done", tutorialComplete: true }))).toEqual([]);
    expect(tutorialCoachStepsFor(hud({ tutorialAssist: false, tutorialStep: "collect" }))).toEqual([]);
  });

  it("prioritizes quick-bank streak copy while the player carries a new haul", () => {
    const state = hud({
      players: [
        player(0, 0),
        { ...player(1, 4), bankStreak: 2, bankStreakBonus: 1, bankStreakTimeLeft: 5.4 },
        player(2, 0),
        player(3, 0),
      ],
    });

    expect(objectiveFor(state, humanHudPlayer(state))).toBe("Streak 2: bank fast for +1 per marble");
  });

  it("builds compact intro briefings with the actual player marker", () => {
    const state = hud({
      phase: "intro",
      humanId: 2,
      modeId: "classic",
      modeName: "Classic",
      modeKind: "classic",
      players: [player(0, 0), player(1, 0), { ...player(2, 0), colorHex: "#4DCC66" }, player(3, 0)],
    });
    const brief = introBriefFor(state);

    expect(brief.eyebrow).toBe("Round 1 of 3");
    expect(brief.title).toBe("P3 Classic");
    expect(brief.playerColor).toBe("#4DCC66");
    expect(brief.steps.map((step) => step.label)).toEqual(["Pull", "Carry", "Bank"]);
    expect(brief.detail).toContain("bank at your goal");
  });

  it("gives each launch mode a distinct pre-round plan", () => {
    const cases = [
      ["battle", "Battle", "battle", ["Load", "Dash", "Steal"], "combat points"],
      ["king-magnet", "King Magnet", "king-magnet", ["Pull", "Protect", "Score"], "2 seconds"],
      ["team-bank", "Team Bank", "team-bank", ["Pair", "Bank", "Defend"], "team shares points"],
      ["survival", "Survival", "survival", ["Survive", "Pulse", "Bank"], "Three lives"],
    ] as const;

    for (const [modeId, modeName, modeKind, labels, detail] of cases) {
      const brief = introBriefFor(hud({
        phase: "intro",
        modeId,
        modeName,
        modeKind,
        totalRounds: 1,
        players: [player(0, 0), player(1, 0), player(2, 0), player(3, 0)],
      }));

      expect(brief.eyebrow).toBe("90-second sprint");
      expect(brief.title).toContain(modeName);
      expect(brief.steps.map((step) => step.label)).toEqual(labels);
      expect(brief.detail).toContain(detail);
    }
  });

  it("summarizes Classic chase and lead pressure without reading the full scoreboard", () => {
    const chasing = hud({
      players: [scoredPlayer(0, 8), scoredPlayer(1, 5), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });

    expect(raceStatusFor(chasing, humanHudPlayer(chasing))).toEqual({
      label: "Chase P1",
      detail: "3 to catch",
      tone: "chase",
    });

    const leading = hud({
      players: [scoredPlayer(0, 8), scoredPlayer(1, 12), scoredPlayer(2, 3), scoredPlayer(3, 0)],
    });

    expect(raceStatusFor(leading, humanHudPlayer(leading))).toEqual({
      label: "Leading +4",
      detail: "Protect the haul",
      tone: "lead",
    });
  });

  it("uses team language for Team Bank status", () => {
    const state = hud({
      modeId: "team-bank",
      modeName: "Team Bank",
      modeKind: "team-bank",
      players: [
        { ...scoredPlayer(0, 14), teamId: 0 },
        { ...scoredPlayer(1, 9), teamId: 1 },
        { ...scoredPlayer(2, 14), teamId: 0 },
        { ...scoredPlayer(3, 9), teamId: 1 },
      ],
    });

    expect(raceStatusFor(state, humanHudPlayer(state))).toEqual({
      label: "Chase Team 1",
      detail: "5 to catch",
      tone: "chase",
    });
  });

  it("uses lives-first language for Survival status", () => {
    const state = hud({
      modeId: "survival",
      modeName: "Survival",
      modeKind: "survival",
      players: [scoredPlayer(0, 10, 0, 3), scoredPlayer(1, 8, 0, 1), scoredPlayer(2, 2, 0, 2), scoredPlayer(3, 0, 0, 1)],
    });

    expect(raceStatusFor(state, humanHudPlayer(state))).toEqual({
      label: "Chase P1",
      detail: "Down 2 lives",
      tone: "danger",
    });
  });

  it("does not show race status during countdown or menus", () => {
    const state = hud({ phase: "intro" });

    expect(raceStatusFor(state, humanHudPlayer(state))).toBeNull();
  });

  it("turns carried count into compact risk and banking advice", () => {
    const empty = hud({ players: [player(0, 0), player(1, 0), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(empty, humanHudPlayer(empty))).toMatchObject({ label: "Empty", tone: "empty" });

    const build = hud({ players: [player(0, 0), player(1, 2), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(build, humanHudPlayer(build))).toEqual({
      label: "Build haul",
      detail: "4 to sweet spot",
      tone: "build",
    });

    const sweet = hud({ players: [player(0, 0), player(1, 6), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(sweet, humanHudPlayer(sweet))).toEqual({
      label: "Sweet spot",
      detail: "Bank or bait",
      tone: "bank",
    });

    const risky = hud({ players: [player(0, 0), player(1, 12), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(risky, humanHudPlayer(risky))).toEqual({
      label: "High risk",
      detail: "Big payout",
      tone: "risk",
    });
  });

  it("prioritizes urgent carry advice for timer, full cluster, and streak pressure", () => {
    const timer = hud({ roundTime: 8, players: [player(0, 0), player(1, 2), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(timer, humanHudPlayer(timer))).toEqual({
      label: "Bank now",
      detail: "Timer low",
      tone: "urgent",
    });

    const streak = hud({
      players: [
        player(0, 0),
        { ...player(1, 4), bankStreak: 2, bankStreakBonus: 1, bankStreakTimeLeft: 5.4 },
        player(2, 0),
        player(3, 0),
      ],
    });
    expect(carryAdviceFor(streak, humanHudPlayer(streak))).toEqual({
      label: "Streak haul",
      detail: "+1 per marble",
      tone: "streak",
    });

    const full = hud({ players: [player(0, 0), player(1, 18), player(2, 0), player(3, 0)] });
    expect(carryAdviceFor(full, humanHudPlayer(full))).toEqual({
      label: "Full haul",
      detail: "Bank before a hit",
      tone: "urgent",
    });
  });

  it("keeps carry advice mode-aware without adding overlay clutter", () => {
    const battle = hud({
      modeId: "battle",
      modeName: "Battle",
      modeKind: "battle",
      players: [player(0, 0), player(1, 3), player(2, 0), player(3, 0)],
    });
    expect(carryAdviceFor(battle, humanHudPlayer(battle))).toEqual({
      label: "Loaded",
      detail: "Dash or bank",
      tone: "risk",
    });

    const king = hud({
      modeId: "king-magnet",
      modeName: "King Magnet",
      modeKind: "king-magnet",
      players: [player(0, 0), player(1, 5), player(2, 0), player(3, 0)],
    });
    expect(carryAdviceFor(king, humanHudPlayer(king))).toEqual({
      label: "King size",
      detail: "Hold the biggest",
      tone: "risk",
    });

    const intro = hud({ phase: "intro" });
    expect(carryAdviceFor(intro, humanHudPlayer(intro))).toBeNull();
  });

  it("surfaces loaded rivals as steal targets when the player is empty", () => {
    const classic = hud({
      players: [
        scoredPlayer(0, 0, 4),
        scoredPlayer(1, 1, 0),
        scoredPlayer(2, 4, 9),
        scoredPlayer(3, 2, 6),
      ],
    });
    const you = humanHudPlayer(classic);

    expect(stealTargetFor(classic, you)?.id).toBe(2);
    expect(carryAdviceFor(classic, you)).toEqual({
      label: "Steal target",
      detail: "P3: 9 carried",
      tone: "target",
    });
    expect(objectiveFor(classic, you)).toBe("Bump loaded P3 or build a haul");

    const battle = hud({
      modeId: "battle",
      modeName: "Battle",
      modeKind: "battle",
      players: [player(0, 0), player(1, 0), player(2, 3), player(3, 1)],
    });
    expect(objectiveFor(battle, humanHudPlayer(battle))).toBe("Dash into loaded P3 to steal");
  });

  it("does not target teammates or eliminated rivals for steal advice", () => {
    const team = hud({
      modeId: "team-bank",
      modeName: "Team Bank",
      modeKind: "team-bank",
      players: [
        { ...player(0, 0), teamId: 0 },
        { ...player(1, 0), teamId: 1 },
        { ...player(2, 12), teamId: 1 },
        { ...player(3, 8), teamId: 0 },
      ],
    });

    expect(stealTargetFor(team, humanHudPlayer(team))?.id).toBe(3);
    expect(carryAdviceFor(team, humanHudPlayer(team))).toMatchObject({
      label: "Steal target",
      detail: "P4: 8 carried",
    });

    const eliminated = hud({
      players: [
        player(0, 0),
        player(1, 0),
        { ...player(2, 11), alive: false, lives: 0 },
        player(3, 0),
      ],
    });
    expect(stealTargetFor(eliminated, humanHudPlayer(eliminated))).toBeNull();
    expect(carryAdviceFor(eliminated, humanHudPlayer(eliminated))).toMatchObject({ label: "Empty" });
  });

  it("warns about rim risk before a knockoff becomes hard to read", () => {
    const safe = hud({
      players: [player(0, 0), { ...player(1, 8), edgeDistance: 2.8, speed: 7.2 }, player(2, 0), player(3, 0)],
    });
    expect(rimDangerFor(safe, humanHudPlayer(safe))).toBeNull();

    const fast = hud({
      players: [player(0, 0), { ...player(1, 2), edgeDistance: 1.1, speed: 6.2 }, player(2, 0), player(3, 0)],
    });
    expect(rimDangerFor(fast, humanHudPlayer(fast))).toEqual({
      label: "Sliding wide",
      detail: "Brake before lip",
      tone: "risk",
    });

    const loaded = hud({
      players: [player(0, 0), { ...player(1, 8), edgeDistance: 1.2, speed: 1.5 }, player(2, 0), player(3, 0)],
    });
    expect(rimDangerFor(loaded, humanHudPlayer(loaded))).toEqual({
      label: "Loaded near rim",
      detail: "Bank or turn inward",
      tone: "risk",
    });

    const critical = hud({
      players: [player(0, 0), { ...player(1, 1), edgeDistance: 0.4, speed: 0.4 }, player(2, 0), player(3, 0)],
    });
    expect(rimDangerFor(critical, humanHudPlayer(critical))).toEqual({
      label: "Rim danger",
      detail: "Turn inward now",
      tone: "danger",
    });

    const survival = hud({
      modeId: "survival",
      modeName: "Survival",
      modeKind: "survival",
      players: [player(0, 0), { ...player(1, 0, 1), edgeDistance: 2.0, speed: 0.4 }, player(2, 0), player(3, 0)],
    });
    expect(rimDangerFor(survival, humanHudPlayer(survival))).toEqual({
      label: "Final-life edge",
      detail: "Pulse defensively",
      tone: "danger",
    });

    const intro = hud({ phase: "intro" });
    expect(rimDangerFor(intro, humanHudPlayer(intro))).toBeNull();
  });

  it("turns right-thumb actions into compact readable phone states", () => {
    expect(actionStatusFor(hud({
      heldPowerup: "magnetBurst",
      dashCooldown: 0,
      magnetActive: false,
    }))).toEqual({
      powerup: { label: "MAG", detail: "Ready", tone: "ready" },
      dash: { label: "Dash", detail: "Ready", tone: "ready" },
      magnet: { label: "Magnet", detail: "Ready", tone: "ready" },
    });

    expect(actionStatusFor(hud({
      heldPowerup: null,
      dashCooldown: 1.2,
      magnetActive: false,
    }), true)).toEqual({
      powerup: { label: "Power", detail: "Empty", tone: "empty" },
      dash: { label: "Dash", detail: "2s", tone: "cooldown" },
      magnet: { label: "Magnet", detail: "Pulling", tone: "active" },
    });
  });

  it("summarizes Classic result recap gaps and next-run advice", () => {
    const state = hud({
      phase: "matchEnd",
      winnerId: 0,
      players: [scoredPlayer(0, 8), scoredPlayer(1, 5), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });

    expect(resultRecapFor(state)).toEqual({
      eyebrow: "Match recap",
      title: "Finished 2nd",
      detail: "3 points behind P1",
      tip: "Bank medium hauls, then steal when rivals slow down.",
      tone: "close",
    });
  });

  it("builds a winning round recap when the player leads", () => {
    const state = hud({
      phase: "roundEnd",
      winnerId: -1,
      players: [scoredPlayer(0, 8), scoredPlayer(1, 12), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });

    expect(resultRecapFor(state)).toEqual({
      eyebrow: "Round recap",
      title: "You set the pace",
      detail: "12 points banked",
      tip: "Keep chaining fast banks for streak bonuses.",
      tone: "win",
    });
  });

  it("uses shared-team language for Team Bank result recap", () => {
    const state = hud({
      phase: "matchEnd",
      modeId: "team-bank",
      modeName: "Team Bank",
      modeKind: "team-bank",
      winnerId: 0,
      players: [
        { ...scoredPlayer(0, 14), teamId: 0 },
        { ...scoredPlayer(1, 9), teamId: 1 },
        { ...scoredPlayer(2, 14), teamId: 0 },
        { ...scoredPlayer(3, 9), teamId: 1 },
      ],
    });

    expect(resultRecapFor(state)).toEqual({
      eyebrow: "Match recap",
      title: "Finished 2nd",
      detail: "5 team points behind Team 1",
      tip: "Split roles: one hauls while one bumps loaded rivals.",
      tone: "close",
    });
  });

  it("turns Survival elimination into readable result recap advice", () => {
    const state = hud({
      phase: "matchEnd",
      modeId: "survival",
      modeName: "Survival",
      modeKind: "survival",
      winnerId: 0,
      players: [scoredPlayer(0, 10, 0, 2), scoredPlayer(1, 8, 0, 0), scoredPlayer(2, 2, 0, 1), scoredPlayer(3, 0, 0, 1)],
    });

    expect(resultRecapFor(state)).toEqual({
      eyebrow: "Match recap",
      title: "Finished 4th",
      detail: "Out of lives before the final table",
      tip: "Stay centered until a rival overcommits near the rim.",
      tone: "learn",
    });
  });

  it("does not build result recap outside results phases", () => {
    expect(resultRecapFor(hud({ phase: "intro" }))).toBeNull();
    expect(resultRecapFor(hud({ phase: "playing" }))).toBeNull();
  });

  it("awards a result mastery badge for new personal bests before generic win copy", () => {
    const state = hud({
      phase: "matchEnd",
      winnerId: 1,
      players: [scoredPlayer(0, 8), scoredPlayer(1, 18), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });

    expect(masteryBadgeFor(state, reward({
      record: {
        modeId: "classic",
        score: 18,
        bestScore: 18,
        previousBest: 12,
        isNewBest: true,
        wins: 1,
        matches: 1,
      },
    }))).toEqual({
      label: "Mastery badge",
      title: "New personal best",
      detail: "18 in Classic - old best 12",
      tone: "record",
    });
  });

  it("turns match wins into mode-specific mastery badges", () => {
    const battle = hud({
      phase: "matchEnd",
      modeId: "battle",
      modeName: "Battle",
      modeKind: "battle",
      winnerId: 1,
      players: [scoredPlayer(0, 8), scoredPlayer(1, 21), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });
    expect(masteryBadgeFor(battle)).toMatchObject({
      title: "Rival smasher",
      detail: "21 combat points",
      tone: "combat",
    });

    const survival = hud({
      phase: "matchEnd",
      modeId: "survival",
      modeName: "Survival",
      modeKind: "survival",
      winnerId: 1,
      players: [scoredPlayer(0, 8, 0, 0), scoredPlayer(1, 12, 0, 2), scoredPlayer(2, 2, 0, 0), scoredPlayer(3, 0, 0, 0)],
    });
    expect(masteryBadgeFor(survival)).toMatchObject({
      title: "Table survivor",
      detail: "2 lives left",
      tone: "survive",
    });
  });

  it("gives close losses a compact next-run mastery target", () => {
    const close = hud({
      phase: "matchEnd",
      winnerId: 0,
      players: [scoredPlayer(0, 10), scoredPlayer(1, 8), scoredPlayer(2, 2), scoredPlayer(3, 0)],
    });
    expect(masteryBadgeFor(close)).toEqual({
      label: "Mastery badge",
      title: "One steal away",
      detail: "2 behind P1",
      tone: "learn",
    });

    expect(masteryBadgeFor(hud({ phase: "playing" }))).toBeNull();
  });
});
