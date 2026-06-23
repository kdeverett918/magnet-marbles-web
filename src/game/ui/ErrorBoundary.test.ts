import { describe, expect, it, vi } from "vitest";
import { PROGRESSION_KEY } from "../data/progression";
import { SETTINGS_KEY, TUTORIAL_KEY } from "../store";
import { clearCrashRecoveryStorage, supportCodeForError } from "./ErrorBoundary";

describe("ErrorBoundary recovery helpers", () => {
  it("creates stable support codes from error details", () => {
    const error = new Error("render failed");
    error.stack = "stack line";

    expect(supportCodeForError(error, "App > GameScene")).toBe(supportCodeForError(error, "App > GameScene"));
    expect(supportCodeForError(error, "App > Hud")).not.toBe(supportCodeForError(error, "App > GameScene"));
    expect(supportCodeForError(error)).toMatch(/^MM-[0-9A-Z]{7}$/);
  });

  it("clears only Magnet Marbles local recovery keys", () => {
    const removed: string[] = [];
    const storage = {
      removeItem: vi.fn((key: string) => removed.push(key)),
    };

    expect(clearCrashRecoveryStorage(storage)).toBe(3);
    expect(removed).toEqual([SETTINGS_KEY, PROGRESSION_KEY, TUTORIAL_KEY]);
  });

  it("keeps recovery available when storage throws", () => {
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error("denied");
      }),
    };

    expect(clearCrashRecoveryStorage(storage)).toBe(0);
    expect(storage.removeItem).toHaveBeenCalledTimes(3);
  });
});
