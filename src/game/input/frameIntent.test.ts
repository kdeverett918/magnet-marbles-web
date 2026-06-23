import { describe, expect, it } from "vitest";
import { humanFrameIntent } from "./frameIntent";
import type { InputState } from "./controls";

function input(overrides: Partial<InputState> = {}): InputState {
  return {
    moveX: 0,
    moveZ: 0,
    magnet: false,
    dash: false,
    activate: false,
    ...overrides,
  };
}

describe("human frame input intent", () => {
  it("does not turn movement into magnet input", () => {
    expect(humanFrameIntent(input({ moveX: 0.9, moveZ: -0.2, magnet: false }))).toMatchObject({
      moveX: 0.9,
      moveZ: -0.2,
      magnet: false,
    });
  });

  it("preserves explicit magnet, dash, and powerup input", () => {
    expect(humanFrameIntent(input({ magnet: true, dash: true, activate: true }))).toEqual({
      moveX: 0,
      moveZ: 0,
      magnet: true,
      dash: true,
      activate: true,
    });
  });
});
