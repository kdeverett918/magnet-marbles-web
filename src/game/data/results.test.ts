import { describe, expect, it } from "vitest";
import { isResultWinner, rankPlayersForResults, resultScoreForPlayer, type ResultPlayer } from "./results";

function player(
  id: number,
  teamId: number,
  score: number,
  lives = 0,
  alive = true,
): ResultPlayer {
  return { id, teamId, score, lives, alive };
}

describe("mode-aware result ranking", () => {
  it("ranks Team Bank by shared team score and marks the whole winning team", () => {
    const players = [
      player(0, 0, 12),
      player(1, 1, 8),
      player(2, 0, 12),
      player(3, 1, 8),
    ];

    const ranked = rankPlayersForResults("team-bank", players, 0);

    expect(ranked.map((entry) => [entry.player.id, entry.placement, entry.isWinner, entry.resultScore])).toEqual([
      [0, 1, true, 12],
      [2, 1, true, 12],
      [1, 2, false, 8],
      [3, 2, false, 8],
    ]);
    expect(isResultWinner("team-bank", players, players[2], 0)).toBe(true);
    expect(resultScoreForPlayer("team-bank", players, players[2])).toBe(12);
  });

  it("does not let an eliminated high scorer outrank the Survival winner", () => {
    const players = [
      player(0, 0, 50, 0, false),
      player(1, 1, 4, 1, true),
      player(2, 2, 15, 0, false),
      player(3, 3, 10, 0, false),
    ];

    const ranked = rankPlayersForResults("survival", players, 1);

    expect(ranked[0].player.id).toBe(1);
    expect(ranked[0].isWinner).toBe(true);
    expect(ranked[0].placement).toBe(1);
  });

  it("uses lives before score for Survival standings before a final winner exists", () => {
    const players = [
      player(0, 0, 40, 1, true),
      player(1, 1, 2, 2, true),
      player(2, 2, 15, 0, false),
      player(3, 3, 10, 1, true),
    ];

    const ranked = rankPlayersForResults("survival", players, -1);

    expect(ranked.map((entry) => entry.player.id)).toEqual([1, 0, 3, 2]);
  });
});
