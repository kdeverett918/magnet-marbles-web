import type { Hud, PlayerHud } from "../store";

export function humanHudPlayer(hud: Pick<Hud, "humanId" | "players">): PlayerHud | undefined {
  return hud.players.find((player) => player.id === hud.humanId) ?? hud.players[0];
}

export function objectiveFor(hud: Hud, you: PlayerHud | undefined) {
  if (hud.tutorialStep === "collect") {
    return "Drag through candy marbles - your magnet pulls them in";
  }
  if (hud.tutorialStep === "bank") {
    return "Follow the red pulse and bank at your goal";
  }
  if (hud.tutorialStep === "done") {
    return "Banked. Now steal, paint, or build a bigger haul";
  }
  if (hud.phase === "intro") {
    return hud.round === 1 ? hud.modeObjective : `${hud.modeName}: round starting`;
  }
  if (hud.suddenDeath) return "Break the tie: bank one marble";
  if (!you) return "Collect marbles and bank at your goal";
  if (hud.modeKind === "survival") {
    if (you.lives <= 1) return "Final life: avoid the rim and use pulses defensively";
    return "Survive the rim, steal safely, and outlast the table";
  }
  if (hud.modeKind === "team-bank") return "Bank at either team goal - your team shares points";
  if (hud.modeKind === "battle") return you.cluster >= 3 ? "Dash into carriers to steal and score" : "Collect a load or ram loaded rivals";
  if (hud.modeKind === "king-magnet") {
    return you.cluster >= 5 ? "Hold the biggest cluster to score every 2 seconds" : "Build the biggest cluster to become King Magnet";
  }
  if (hud.roundTime <= 12 && you.cluster > 0) return "Time is low: bank your haul";
  if (you.cluster >= Math.max(1, hud.clusterCap)) return "Cluster full: bank at your goal";
  if (you.cluster >= 6) return "Bank now or risk a bigger haul";
  return "Collect marbles, then bank at your goal";
}

export function objectiveAnnouncementFor(hud: Hud, objective: string) {
  if (hud.phase === "intro") {
    return `Objective: ${objective}. ${hud.modeName}, round ${hud.round} of ${hud.totalRounds}.`;
  }
  return `Objective: ${objective}.`;
}
