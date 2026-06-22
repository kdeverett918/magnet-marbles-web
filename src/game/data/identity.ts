export function playerMarker(player: number | { id: number }): string {
  const id = typeof player === "number" ? player : player.id;
  return `P${id + 1}`;
}

export function goalMarker(ownerId: number, teamId: number, teamBank: boolean): string {
  return teamBank ? `T${teamId + 1} ${playerMarker(ownerId)}` : playerMarker(ownerId);
}

export function identityPipCount(player: number | { id: number }): number {
  const id = typeof player === "number" ? player : player.id;
  return Math.max(1, Math.min(4, id + 1));
}
