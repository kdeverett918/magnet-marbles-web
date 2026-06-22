import { describe, expect, it } from "vitest";
import type { Hud, PlayerHud } from "../store";
import { humanHudPlayer, objectiveAnnouncementFor, objectiveFor } from "./hudModel";

function player(id: number, cluster: number, lives = 3): PlayerHud {
  return {
    id,
    name: `P${id}`,
    colorHex: "#fff",
    teamId: id,
    score: 0,
    lives,
    cluster,
    isBot: id !== 1,
    alive: lives > 0,
  };
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
});
