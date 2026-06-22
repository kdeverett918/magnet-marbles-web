import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorld, useGame } from "./store";

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

describe("game store pause lifecycle", () => {
  afterEach(() => {
    useGame.getState().quitToMenu();
    if (!useGame.getState().settings.sound) useGame.getState().toggleSound();
    useGame.getState().setSfxVolume(0.65);
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
});
