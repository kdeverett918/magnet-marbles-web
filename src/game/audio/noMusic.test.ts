import { describe, expect, it } from "vitest";
import { installNoMusicGuard, installRemovedMusicPlayBlocker, isRemovedMusicUrl } from "./noMusic";

describe("removed music guard", () => {
  it("matches every removed background music format", () => {
    for (const ext of ["mp3", "wav", "ogg", "m4a", "aac", "flac"]) {
      expect(isRemovedMusicUrl(`https://magnet-marbles.local/audio/music.${ext}`)).toBe(true);
      expect(isRemovedMusicUrl(`./audio/music.${ext}?v=old`)).toBe(true);
    }
  });

  it("does not treat shipped gameplay SFX as removed music", () => {
    expect(isRemovedMusicUrl("./audio/sfx/pickup.mp3")).toBe(false);
    expect(isRemovedMusicUrl("./audio/sfx/magnet-burst.mp3")).toBe(false);
    expect(isRemovedMusicUrl("./assets/music-button.svg")).toBe(false);
  });

  it("is safe to install during no-browser validation", () => {
    expect(installRemovedMusicPlayBlocker()).toBe(false);
    expect(installNoMusicGuard()).toEqual({ patchedPlay: false });
  });
});
