import type { ModeDef } from "./types";

export interface ResultPlayer {
  id: number;
  teamId: number;
  score: number;
  lives: number;
  alive: boolean;
}

export interface RankedResultPlayer<T extends ResultPlayer> {
  player: T;
  placement: number;
  isWinner: boolean;
  resultScore: number;
}

type ModeKind = ModeDef["kind"];

function teamScores<T extends ResultPlayer>(players: T[]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const player of players) {
    if (!scores.has(player.teamId)) scores.set(player.teamId, player.score);
  }
  return scores;
}

export function resultScoreForPlayer<T extends ResultPlayer>(modeKind: ModeKind, players: T[], player: T): number {
  if (modeKind === "team-bank") {
    return teamScores(players).get(player.teamId) ?? player.score;
  }
  return player.score;
}

export function isResultWinner<T extends ResultPlayer>(
  modeKind: ModeKind,
  players: T[],
  player: T,
  winnerId: number,
): boolean {
  if (winnerId < 0) return false;
  if (player.id === winnerId) return true;
  if (modeKind !== "team-bank") return false;
  const winner = players.find((candidate) => candidate.id === winnerId);
  return Boolean(winner && winner.teamId === player.teamId);
}

export function rankPlayersForResults<T extends ResultPlayer>(
  modeKind: ModeKind,
  players: T[],
  winnerId: number,
): RankedResultPlayer<T>[] {
  const scoresByTeam = modeKind === "team-bank" ? teamScores(players) : null;
  const rankValue = (player: T) => {
    if (modeKind === "team-bank") return scoresByTeam?.get(player.teamId) ?? player.score;
    if (modeKind === "survival") return player.lives * 1000 + player.score;
    return player.score;
  };

  const sorted = [...players].sort((a, b) => {
    const aWins = isResultWinner(modeKind, players, a, winnerId);
    const bWins = isResultWinner(modeKind, players, b, winnerId);
    if (aWins !== bWins) return aWins ? -1 : 1;
    if (modeKind === "survival" && a.alive !== b.alive) return a.alive ? -1 : 1;
    const valueDelta = rankValue(b) - rankValue(a);
    if (valueDelta !== 0) return valueDelta;
    return a.id - b.id;
  });

  let lastRankValue: number | null = null;
  let lastPlacement = 0;

  return sorted.map((player) => {
    const value = rankValue(player);
    if (lastRankValue === null || value !== lastRankValue) {
      lastPlacement += 1;
      lastRankValue = value;
    }
    return {
      player,
      placement: lastPlacement,
      isWinner: isResultWinner(modeKind, players, player, winnerId),
      resultScore: modeKind === "team-bank" ? scoresByTeam?.get(player.teamId) ?? player.score : player.score,
    };
  });
}
