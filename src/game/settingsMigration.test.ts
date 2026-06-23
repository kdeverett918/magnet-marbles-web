import { afterEach, describe, expect, it, vi } from "vitest";

const SETTINGS_KEY = "magnet-marbles:settings:v1";

function stubSettingsStorage(seed: Record<string, unknown>) {
  const storage = new Map<string, string>([[SETTINGS_KEY, JSON.stringify(seed)]]);
  vi.stubGlobal("window", {
    innerWidth: 1024,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  return storage;
}

describe("settings audio migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("caps legacy saved SFX volumes to the quieter launch baseline", async () => {
    const storage = stubSettingsStorage({
      sound: false,
      sfxVolume: 0.65,
      haptics: false,
      colorAssist: true,
      motion: "reduced",
      quality: "high",
      botDifficulty: "hard",
    });

    vi.resetModules();
    const { useGame } = await import("./store");

    expect(useGame.getState().settings).toMatchObject({
      sound: false,
      sfxVolume: 0.28,
      audioTuningVersion: 2,
      haptics: false,
      colorAssist: true,
      motion: "reduced",
      quality: "high",
      botDifficulty: "hard",
    });
    expect(JSON.parse(storage.get(SETTINGS_KEY) || "{}")).toMatchObject({
      sfxVolume: 0.28,
      audioTuningVersion: 2,
      sound: false,
      haptics: false,
      colorAssist: true,
    });
  });

  it("preserves current-version volume choices after migration", async () => {
    const storage = stubSettingsStorage({
      sound: true,
      sfxVolume: 0.72,
      audioTuningVersion: 2,
      haptics: true,
      colorAssist: false,
      motion: "auto",
      quality: "lite",
      botDifficulty: "normal",
    });

    vi.resetModules();
    const { useGame } = await import("./store");

    expect(useGame.getState().settings).toMatchObject({
      sfxVolume: 0.72,
      audioTuningVersion: 2,
      quality: "lite",
    });

    useGame.getState().setSfxVolume(0.9);
    expect(JSON.parse(storage.get(SETTINGS_KEY) || "{}")).toMatchObject({
      sfxVolume: 0.9,
      audioTuningVersion: 2,
    });
  });
});
