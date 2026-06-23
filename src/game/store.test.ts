import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROGRESSION, PROGRESSION_KEY, dailyChallengeFor, normalizeProgression } from "./data/progression";
import { getWorld, SETTINGS_KEY, TUTORIAL_KEY, useGame, type Hud } from "./store";

function stubSettingsStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  return storage;
}

function matchEndHud(score: number, winnerId: number): Hud {
  return {
    phase: "matchEnd",
    round: 3,
    totalRounds: 3,
    roundTime: 0,
    introCountdown: 0,
    suddenDeath: false,
    winnerId,
    modeId: "classic",
    modeName: "Classic",
    modeKind: "classic",
    modeObjective: "Collect marbles and bank at your goal.",
    humanId: 0,
    players: [
      {
        id: 0,
        name: "You",
        colorHex: "#f24447",
        teamId: 0,
        edgeDistance: 6,
        speed: 0,
        height: 0,
        score,
        lives: 3,
        cluster: 0,
        bankStreak: 0,
        bankStreakBonus: 0,
        bankStreakTimeLeft: 0,
        isBot: false,
        botPersonality: null,
        alive: true,
      },
      {
        id: 1,
        name: "Bot",
        colorHex: "#338cf2",
        teamId: 1,
        edgeDistance: 6,
        speed: 0,
        height: 0,
        score: 10,
        lives: 3,
        cluster: 0,
        bankStreak: 0,
        bankStreakBonus: 0,
        bankStreakTimeLeft: 0,
        isBot: true,
        botPersonality: "collector",
        alive: true,
      },
    ],
    heldPowerup: null,
    activePowerups: [],
    dashCooldown: 0,
    magnetActive: false,
    clusterCap: 18,
    tutorialAssist: false,
    tutorialStep: "off",
    tutorialGoalPulse: false,
    tutorialComplete: false,
  };
}

describe("game store pause lifecycle", () => {
  afterEach(() => {
    useGame.getState().quitToMenu();
    useGame.setState({
      progression: normalizeProgression(DEFAULT_PROGRESSION),
      activeDailyId: null,
      runId: 0,
      lastReward: null,
    });
    if (!useGame.getState().settings.sound) useGame.getState().toggleSound();
    useGame.getState().setSfxVolume(0.28);
    if (useGame.getState().settings.colorAssist) useGame.getState().toggleColorAssist();
    useGame.getState().setMotion("auto");
    useGame.getState().setBotDifficulty("normal");
    vi.unstubAllGlobals();
  });

  it("pauses and resumes local solo matches", () => {
    useGame.getState().startGame("classic", 4);

    expect(useGame.getState().screen).toBe("game");
    expect(useGame.getState().online).toBe(false);
    expect(useGame.getState().paused).toBe(false);

    useGame.getState().togglePaused();
    expect(useGame.getState().paused).toBe(true);

    useGame.getState().togglePaused();
    expect(useGame.getState().paused).toBe(false);
  });

  it("clears pause state when restarting or returning to menu", () => {
    useGame.getState().startGame("classic", 4);
    useGame.getState().setPaused(true);
    expect(useGame.getState().paused).toBe(true);

    useGame.getState().startGame("battle", 4);
    expect(useGame.getState().paused).toBe(false);

    useGame.getState().setPaused(true);
    useGame.getState().quitToMenu();
    expect(useGame.getState().screen).toBe("menu");
    expect(useGame.getState().paused).toBe(false);
  });

  it("does not pause online matches because the authoritative server keeps running", () => {
    useGame.setState({ screen: "game", online: true, paused: false });

    useGame.getState().setPaused(true);
    expect(useGame.getState().paused).toBe(false);

    useGame.getState().togglePaused();
    expect(useGame.getState().paused).toBe(false);
  });

  it("passes selected bot difficulty into local solo and daily worlds", () => {
    useGame.getState().setBotDifficulty("hard");
    useGame.getState().startGame("classic", 4);
    expect(getWorld()).toMatchObject({ botDifficulty: "hard" });

    useGame.getState().quitToMenu();
    useGame.getState().setBotDifficulty("easy");
    useGame.getState().startDailyChallenge();
    expect(getWorld()).toMatchObject({ botDifficulty: "easy" });
  });

  it("clamps and persists the SFX volume setting", () => {
    const storage = stubSettingsStorage();

    useGame.getState().setSfxVolume(1.5);
    expect(useGame.getState().settings.sfxVolume).toBe(1);
    expect(JSON.parse(storage.get("magnet-marbles:settings:v1") || "{}")).toMatchObject({ sfxVolume: 1 });

    useGame.getState().setSfxVolume(0.4);
    useGame.getState().setSfxVolume(Number.NaN);
    expect(useGame.getState().settings.sfxVolume).toBe(0.4);

    useGame.getState().setSfxVolume(-2);
    expect(useGame.getState().settings.sfxVolume).toBe(0);
  });

  it("persists the Color Assist readability setting", () => {
    const storage = stubSettingsStorage();

    useGame.getState().toggleColorAssist();
    expect(useGame.getState().settings.colorAssist).toBe(true);
    expect(JSON.parse(storage.get("magnet-marbles:settings:v1") || "{}")).toMatchObject({ colorAssist: true });

    useGame.getState().toggleColorAssist();
    expect(useGame.getState().settings.colorAssist).toBe(false);
  });

  it("persists the motion accessibility setting", () => {
    const storage = stubSettingsStorage();

    useGame.getState().setMotion("reduced");
    expect(useGame.getState().settings.motion).toBe("reduced");
    expect(JSON.parse(storage.get("magnet-marbles:settings:v1") || "{}")).toMatchObject({ motion: "reduced" });

    useGame.getState().setMotion("full");
    expect(useGame.getState().settings.motion).toBe("full");
  });

  it("unlocks and equips a ready cosmetic reward from stored stars", () => {
    const storage = stubSettingsStorage();
    useGame.setState({
      progression: normalizeProgression({
        ...DEFAULT_PROGRESSION,
        stars: 4,
        totalStarsEarned: 4,
      }),
    });

    useGame.getState().unlockTrail("candy");

    expect(useGame.getState().progression).toMatchObject({
      stars: 0,
      selectedTrail: "candy",
      unlockedTrails: ["comet", "candy"],
    });
    expect(JSON.parse(storage.get(PROGRESSION_KEY) || "{}")).toMatchObject({
      stars: 0,
      selectedTrail: "candy",
      unlockedTrails: ["comet", "candy"],
    });
  });

  it("clears local game data without touching unrelated site storage", () => {
    const storage = stubSettingsStorage();
    const savedProgression = normalizeProgression({
      ...DEFAULT_PROGRESSION,
      stars: 16,
      totalStarsEarned: 24,
      selectedTrail: "gold",
      unlockedTrails: ["comet", "candy", "gold"],
      dailyCompleted: ["2026-06-22"],
      dailyStreak: { current: 3, best: 5, lastCompleted: "2026-06-22" },
      records: { classic: { bestScore: 31, wins: 2, matches: 4 } },
    });

    storage.set("unrelated:site-key", "keep");
    storage.set(PROGRESSION_KEY, JSON.stringify(savedProgression));
    storage.set(TUTORIAL_KEY, "1");
    useGame.getState().setSfxVolume(0.2);
    if (useGame.getState().settings.haptics) useGame.getState().toggleHaptics();
    useGame.getState().toggleColorAssist();
    useGame.getState().setMotion("reduced");
    useGame.getState().setBotDifficulty("hard");
    useGame.setState({
      screen: "game",
      paused: true,
      modeId: "survival",
      playerCount: 2,
      progression: savedProgression,
      activeDailyId: "2026-06-22",
      runId: 42,
      lastReward: {
        stars: 7,
        placement: 1,
        won: true,
        dailyCompleted: true,
        reasons: ["Daily challenge"],
        runId: 42,
        dailyId: "2026-06-22",
        dailyStreak: { current: 3, best: 5 },
        record: {
          modeId: "classic",
          score: 31,
          bestScore: 31,
          previousBest: 0,
          isNewBest: true,
          wins: 2,
          matches: 4,
        },
      },
    });

    useGame.getState().clearLocalData();

    expect(storage.get("unrelated:site-key")).toBe("keep");
    expect(storage.has(SETTINGS_KEY)).toBe(false);
    expect(storage.has(PROGRESSION_KEY)).toBe(false);
    expect(storage.has(TUTORIAL_KEY)).toBe(false);
    expect(useGame.getState()).toMatchObject({
      screen: "menu",
      paused: false,
      modeId: "classic",
      playerCount: 4,
      activeDailyId: null,
      runId: 0,
      lastReward: null,
    });
    expect(useGame.getState().settings).toMatchObject({
      sound: true,
      sfxVolume: 0.28,
      haptics: true,
      colorAssist: false,
      motion: "auto",
      quality: "high",
      botDifficulty: "normal",
    });
    expect(useGame.getState().progression).toEqual(normalizeProgression(DEFAULT_PROGRESSION));
  });

  it("records local mode bests without double-counting the same match reward", () => {
    const storage = stubSettingsStorage();

    useGame.setState({
      online: false,
      progression: normalizeProgression(DEFAULT_PROGRESSION),
      activeDailyId: null,
      runId: 701,
      lastReward: null,
    });

    const winHud = matchEndHud(18, 0);
    useGame.getState().claimMatchReward(winHud);
    useGame.getState().claimMatchReward(winHud);

    expect(useGame.getState().progression.records.classic).toEqual({ bestScore: 18, wins: 1, matches: 1 });
    expect(useGame.getState().lastReward?.record).toMatchObject({
      modeId: "classic",
      score: 18,
      bestScore: 18,
      previousBest: 0,
      isNewBest: true,
      wins: 1,
      matches: 1,
    });

    useGame.setState({ runId: 702, lastReward: null });
    useGame.getState().claimMatchReward(matchEndHud(12, 1));

    expect(useGame.getState().progression.records.classic).toEqual({ bestScore: 18, wins: 1, matches: 2 });
    expect(useGame.getState().lastReward?.record).toMatchObject({
      score: 12,
      bestScore: 18,
      previousBest: 18,
      isNewBest: false,
      wins: 1,
      matches: 2,
    });
    expect(JSON.parse(storage.get(PROGRESSION_KEY) || "{}").records.classic).toEqual({
      bestScore: 18,
      wins: 1,
      matches: 2,
    });
  });

  it("exposes daily streak progress when a daily match reward is claimed", () => {
    const daily = dailyChallengeFor(new Date("2026-06-22T12:00:00Z"));

    useGame.setState({
      online: false,
      progression: normalizeProgression(DEFAULT_PROGRESSION),
      dailyChallenge: daily,
      activeDailyId: daily.id,
      runId: 801,
      lastReward: null,
    });

    useGame.getState().claimMatchReward(matchEndHud(30, 0));

    expect(useGame.getState().progression.dailyStreak).toEqual({
      current: 1,
      best: 1,
      lastCompleted: daily.id,
    });
    expect(useGame.getState().lastReward).toMatchObject({
      dailyCompleted: true,
      dailyStreak: { current: 1, best: 1 },
    });
  });
});
