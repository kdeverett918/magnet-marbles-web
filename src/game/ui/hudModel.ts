import type { Hud, PlayerHud, RewardSummary } from "../store";
import { POWERUP_META } from "../data/config";
import { playerMarker } from "../data/identity";
import { rankPlayersForResults, resultScoreForPlayer } from "../data/results";

export type CoachStep = {
  key: "pull" | "carry" | "bank";
  label: string;
  detail: string;
  state: "done" | "active" | "next";
};

export type IntroBriefStep = {
  label: string;
  detail: string;
};

export type IntroBrief = {
  eyebrow: string;
  title: string;
  detail: string;
  playerColor: string;
  steps: IntroBriefStep[];
};

export type RaceStatus = {
  label: string;
  detail: string;
  tone: "lead" | "tie" | "chase" | "danger";
};

export type CarryAdvice = {
  label: string;
  detail: string;
  tone: "empty" | "build" | "bank" | "risk" | "urgent" | "streak" | "target";
};

export type RimDanger = {
  label: string;
  detail: string;
  tone: "risk" | "danger";
};

export type ActionStatus = {
  powerup: {
    label: string;
    detail: string;
    tone: "ready" | "empty";
  };
  dash: {
    label: string;
    detail: string;
    tone: "ready" | "cooldown";
  };
  magnet: {
    label: string;
    detail: string;
    tone: "ready" | "active";
  };
};

export type ResultRecap = {
  eyebrow: string;
  title: string;
  detail: string;
  tip: string;
  tone: "win" | "close" | "learn";
};

export type MasteryBadge = {
  label: string;
  title: string;
  detail: string;
  tone: "record" | "bank" | "combat" | "survive" | "learn";
};

export function humanHudPlayer(hud: Pick<Hud, "humanId" | "players">): PlayerHud | undefined {
  return hud.players.find((player) => player.id === hud.humanId) ?? hud.players[0];
}

function ordinal(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function plural(value: number, unit: string) {
  if (unit === "life") return `${value} ${value === 1 ? "life" : "lives"}`;
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function modeTipFor(hud: Hud, ahead: boolean) {
  if (hud.modeKind === "team-bank") return ahead ? "Protect the shared lead: one hauls while one disrupts." : "Split roles: one hauls while one bumps loaded rivals.";
  if (hud.modeKind === "survival") return ahead ? "Keep a pulse ready for rim fights." : "Stay centered until a rival overcommits near the rim.";
  if (hud.modeKind === "battle") return ahead ? "Take fights only when rivals carry a load." : "Dash after loaded rivals turn toward a goal.";
  if (hud.modeKind === "king-magnet") return ahead ? "Guard the biggest cluster instead of over-chasing." : "Build five-plus marbles before picking fights.";
  return ahead ? "Keep chaining fast banks for streak bonuses." : "Bank medium hauls, then steal when rivals slow down.";
}

export function resultRecapFor(hud: Hud): ResultRecap | null {
  if (hud.phase !== "roundEnd" && hud.phase !== "matchEnd") return null;
  const you = humanHudPlayer(hud);
  if (!you || hud.players.length < 2) return null;
  const ranked = rankPlayersForResults(hud.modeKind, hud.players, hud.winnerId);
  const youRank = ranked.find((entry) => entry.player.id === you.id);
  const leader = ranked[0];
  if (!youRank || !leader) return null;

  const top = youRank.placement === 1;
  const won = youRank.isWinner || (hud.phase === "roundEnd" && top);
  const placement = ordinal(youRank.placement);
  const leaderMarker = playerMarker(leader.player.id);
  const title = won
    ? hud.modeKind === "team-bank" ? "Your team set the pace" : "You set the pace"
    : hud.phase === "matchEnd" ? `Finished ${placement}` : `${placement} after round ${hud.round}`;
  const eyebrow = hud.phase === "matchEnd" ? "Match recap" : "Round recap";
  const tone: ResultRecap["tone"] = won ? "win" : youRank.placement <= 2 ? "close" : "learn";

  if (hud.modeKind === "team-bank") {
    const teams = [...new Map(hud.players.map((p) => [p.teamId, p.score])).entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const youTeam = teams.find(([teamId]) => teamId === you.teamId);
    const leaderTeam = teams[0];
    if (!youTeam || !leaderTeam) return null;
    const gap = Math.max(0, leaderTeam[1] - youTeam[1]);
    return {
      eyebrow,
      title,
      detail: top ? `Team ${you.teamId + 1} banked ${youTeam[1]}` : `${gap} team points behind Team ${leaderTeam[0] + 1}`,
      tip: modeTipFor(hud, top),
      tone,
    };
  }

  if (hud.modeKind === "survival") {
    if (!you.alive || you.lives <= 0) {
      return {
        eyebrow,
        title,
        detail: "Out of lives before the final table",
        tip: modeTipFor(hud, false),
        tone: "learn",
      };
    }
    const lifeGap = Math.max(0, leader.player.lives - you.lives);
    return {
      eyebrow,
      title,
      detail: top ? `${plural(you.lives, "life")} left - best on table` : `Down ${plural(lifeGap, "life")} to ${leaderMarker}`,
      tip: modeTipFor(hud, top),
      tone,
    };
  }

  const youScore = resultScoreForPlayer(hud.modeKind, hud.players, you);
  const gap = Math.max(0, leader.resultScore - youScore);
  return {
    eyebrow,
    title,
    detail: top ? `${youScore} points banked` : `${gap} points behind ${leaderMarker}`,
    tip: modeTipFor(hud, top),
    tone,
  };
}

export function masteryBadgeFor(hud: Hud, reward?: RewardSummary | null): MasteryBadge | null {
  if (hud.phase !== "matchEnd") return null;
  const you = humanHudPlayer(hud);
  if (!you || hud.players.length < 2) return null;
  const ranked = rankPlayersForResults(hud.modeKind, hud.players, hud.winnerId);
  const youRank = ranked.find((entry) => entry.player.id === you.id);
  const leader = ranked[0];
  if (!youRank || !leader) return null;

  const score = resultScoreForPlayer(hud.modeKind, hud.players, you);
  if (reward?.record.isNewBest) {
    const previous = reward.record.previousBest > 0 ? `old best ${reward.record.previousBest}` : "first record";
    return {
      label: "Mastery badge",
      title: "New personal best",
      detail: `${score} in ${hud.modeName} - ${previous}`,
      tone: "record",
    };
  }

  if (youRank.isWinner) {
    if (hud.modeKind === "team-bank") {
      return {
        label: "Mastery badge",
        title: "Team anchor",
        detail: `Team ${you.teamId + 1} held first`,
        tone: "bank",
      };
    }
    if (hud.modeKind === "survival") {
      return {
        label: "Mastery badge",
        title: "Table survivor",
        detail: `${plural(Math.max(you.lives, 0), "life")} left`,
        tone: "survive",
      };
    }
    if (hud.modeKind === "battle") {
      return {
        label: "Mastery badge",
        title: "Rival smasher",
        detail: `${score} combat points`,
        tone: "combat",
      };
    }
    if (hud.modeKind === "king-magnet") {
      return {
        label: "Mastery badge",
        title: "King keeper",
        detail: "Held the biggest pull",
        tone: "combat",
      };
    }
    return {
      label: "Mastery badge",
      title: you.bankStreak >= 2 ? "Clutch banker" : "Magnet closer",
      detail: you.bankStreak >= 2 ? `Bank streak ${you.bankStreak} sealed it` : `${score} points banked`,
      tone: "bank",
    };
  }

  if (you.bankStreak >= 2) {
    return {
      label: "Mastery badge",
      title: "Fast banker",
      detail: `Streak ${you.bankStreak} - chain one more`,
      tone: "bank",
    };
  }

  if (youRank.placement === 2) {
    const leaderMarker = playerMarker(leader.player.id);
    const gap = hud.modeKind === "survival"
      ? Math.max(0, leader.player.lives - you.lives)
      : Math.max(0, leader.resultScore - score);
    return {
      label: "Mastery badge",
      title: hud.modeKind === "survival" ? "Final table threat" : "One steal away",
      detail: hud.modeKind === "survival" ? `Down ${plural(gap, "life")} to ${leaderMarker}` : `${gap} behind ${leaderMarker}`,
      tone: "learn",
    };
  }

  return {
    label: "Mastery badge",
    title: "Next run target",
    detail: hud.modeKind === "battle" ? "Hit loaded rivals earlier" : "Bank medium hauls sooner",
    tone: "learn",
  };
}

export function raceStatusFor(hud: Hud, you: PlayerHud | undefined): RaceStatus | null {
  if (!you || hud.phase !== "playing" || hud.players.length < 2) return null;

  if (hud.modeKind === "team-bank") {
    const teams = [...new Map(hud.players.map((p) => [p.teamId, p.score])).entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const youTeam = teams.find(([teamId]) => teamId === you.teamId);
    const leader = teams[0];
    if (!youTeam || !leader) return null;
    const tiedTop = teams.filter(([, score]) => score === leader[1]);
    if (youTeam[1] === leader[1] && tiedTop.length > 1) {
      return { label: "Team tie", detail: "Bank any haul to break it", tone: "tie" };
    }
    if (youTeam[0] === leader[0]) {
      const next = teams.find(([teamId]) => teamId !== you.teamId);
      const delta = Math.max(0, youTeam[1] - (next?.[1] ?? 0));
      return { label: delta > 0 ? `Team lead +${delta}` : "Team lead", detail: "Defend shared bank", tone: "lead" };
    }
    return { label: `Chase Team ${leader[0] + 1}`, detail: `${leader[1] - youTeam[1]} to catch`, tone: "chase" };
  }

  const ranked = rankPlayersForResults(hud.modeKind, hud.players, hud.winnerId);
  const youRank = ranked.find((entry) => entry.player.id === you.id);
  const leader = ranked[0];
  if (!youRank || !leader) return null;
  const tiedTop = ranked.filter((entry) => entry.placement === 1);
  const leaderMarker = playerMarker(leader.player.id);

  if (hud.modeKind === "survival") {
    if (!you.alive || you.lives <= 0) return { label: "Eliminated", detail: "Watch the final table", tone: "danger" };
    if (youRank.placement === 1 && tiedTop.length > 1) {
      return { label: "Life tie", detail: "Stay centered", tone: "tie" };
    }
    if (youRank.placement === 1) {
      const next = ranked.find((entry) => entry.player.id !== you.id);
      const lifeLead = Math.max(0, you.lives - (next?.player.lives ?? 0));
      return { label: lifeLead > 0 ? `Lead +${plural(lifeLead, "life")}` : "Top survivor", detail: "Pulse near the rim", tone: "lead" };
    }
    const lifeDelta = Math.max(0, leader.player.lives - you.lives);
    return {
      label: `Chase ${leaderMarker}`,
      detail: lifeDelta > 0 ? `Down ${plural(lifeDelta, "life")}` : `${leader.resultScore - resultScoreForPlayer(hud.modeKind, hud.players, you)} pts back`,
      tone: you.lives <= 1 ? "danger" : "chase",
    };
  }

  const youScore = resultScoreForPlayer(hud.modeKind, hud.players, you);
  if (youRank.placement === 1 && tiedTop.length > 1) {
    return { label: "Tied lead", detail: hud.suddenDeath ? "Next score wins" : "Bank to break it", tone: "tie" };
  }
  if (youRank.placement === 1) {
    const next = ranked.find((entry) => entry.player.id !== you.id);
    const delta = Math.max(0, youScore - (next?.resultScore ?? 0));
    return { label: delta > 0 ? `Leading +${delta}` : "Leading", detail: hud.modeKind === "king-magnet" ? "Keep biggest cluster" : "Protect the haul", tone: "lead" };
  }
  const delta = Math.max(0, leader.resultScore - youScore);
  return { label: `Chase ${leaderMarker}`, detail: `${delta} to catch`, tone: "chase" };
}

export function carryAdviceFor(hud: Hud, you: PlayerHud | undefined): CarryAdvice | null {
  if (!you || hud.phase !== "playing") return null;

  const cap = Math.max(1, hud.clusterCap);
  const sweetSpot = Math.min(cap, 6);
  const highRisk = Math.max(sweetSpot + 1, Math.ceil(cap * 0.66));
  const stealTarget = stealTargetFor(hud, you);

  if (you.cluster <= 0) {
    if (hud.modeKind === "survival" && you.lives <= 1) return { label: "Keep centered", detail: "Final life", tone: "empty" };
    if (stealTarget) {
      return {
        label: "Steal target",
        detail: `${playerMarker(stealTarget.id)}: ${stealTarget.cluster} carried`,
        tone: "target",
      };
    }
    return { label: "Empty", detail: "Hold magnet near candy", tone: "empty" };
  }

  if (hud.roundTime <= 12) return { label: "Bank now", detail: "Timer low", tone: "urgent" };

  if (you.bankStreak >= 2 && you.bankStreakBonus > 0 && you.bankStreakTimeLeft > 0) {
    return { label: "Streak haul", detail: `+${you.bankStreakBonus} per marble`, tone: "streak" };
  }

  if (you.cluster >= cap) return { label: "Full haul", detail: "Bank before a hit", tone: "urgent" };

  if (hud.modeKind === "king-magnet" && you.cluster >= 5) {
    return { label: "King size", detail: "Hold the biggest", tone: "risk" };
  }

  if (hud.modeKind === "battle" && you.cluster >= 3) {
    return { label: "Loaded", detail: "Dash or bank", tone: "risk" };
  }

  if (you.cluster >= highRisk) return { label: "High risk", detail: "Big payout", tone: "risk" };
  if (you.cluster >= sweetSpot) return { label: "Sweet spot", detail: "Bank or bait", tone: "bank" };
  return { label: "Build haul", detail: `${sweetSpot - you.cluster} to sweet spot`, tone: "build" };
}

function stealThresholdFor(hud: Pick<Hud, "modeKind">): number {
  if (hud.modeKind === "battle") return 3;
  if (hud.modeKind === "king-magnet") return 5;
  return 6;
}

export function stealTargetFor(hud: Hud, you: PlayerHud | undefined): PlayerHud | null {
  if (!you || hud.phase !== "playing") return null;
  const threshold = stealThresholdFor(hud);
  const candidates = hud.players.filter((player) => {
    if (player.id === you.id) return false;
    if (!player.alive) return false;
    if (hud.modeKind === "team-bank" && player.teamId === you.teamId) return false;
    return player.cluster >= threshold;
  });
  candidates.sort((a, b) => b.cluster - a.cluster || b.score - a.score || a.id - b.id);
  return candidates[0] ?? null;
}

export function rimDangerFor(hud: Hud, you: PlayerHud | undefined): RimDanger | null {
  if (!you || hud.phase !== "playing") return null;

  if (!you.alive || you.height < -0.1) {
    return {
      label: "Rim out",
      detail: hud.modeKind === "survival" ? "Life at risk" : "Dropping haul",
      tone: "danger",
    };
  }

  if (you.edgeDistance <= 0.55) {
    return { label: "Rim danger", detail: "Turn inward now", tone: "danger" };
  }

  if (hud.modeKind === "survival" && you.lives <= 1 && you.edgeDistance <= 2.2) {
    return { label: "Final-life edge", detail: "Pulse defensively", tone: "danger" };
  }

  if (you.edgeDistance <= 1.35 && you.speed >= 5.8) {
    return { label: "Sliding wide", detail: "Brake before lip", tone: "risk" };
  }

  if (you.cluster >= 4 && you.edgeDistance <= 1.25) {
    return { label: "Loaded near rim", detail: "Bank or turn inward", tone: "risk" };
  }

  if (hud.modeKind === "survival" && you.edgeDistance <= 1.7) {
    return { label: "Edge pressure", detail: "Keep center line", tone: "risk" };
  }

  return null;
}

function cooldownSeconds(value: number): string {
  return `${Math.max(1, Math.ceil(value))}s`;
}

export function actionStatusFor(
  hud: Pick<Hud, "heldPowerup" | "dashCooldown" | "magnetActive">,
  magnetHeld = false
): ActionStatus {
  const powerup = hud.heldPowerup
    ? {
        label: POWERUP_META[hud.heldPowerup].short,
        detail: "Ready",
        tone: "ready" as const,
      }
    : {
        label: "Power",
        detail: "Empty",
        tone: "empty" as const,
      };

  const dash = hud.dashCooldown <= 0
    ? {
        label: "Dash",
        detail: "Ready",
        tone: "ready" as const,
      }
    : {
        label: "Dash",
        detail: cooldownSeconds(hud.dashCooldown),
        tone: "cooldown" as const,
      };

  const magnetActive = magnetHeld || hud.magnetActive;
  const magnet = magnetActive
    ? {
        label: "Magnet",
        detail: "Pulling",
        tone: "active" as const,
      }
    : {
        label: "Magnet",
        detail: "Ready",
        tone: "ready" as const,
      };

  return { powerup, dash, magnet };
}

export function introBriefFor(hud: Hud): IntroBrief {
  const you = humanHudPlayer(hud);
  const marker = playerMarker(you?.id ?? hud.humanId);
  const round = hud.totalRounds > 1 ? `Round ${hud.round} of ${hud.totalRounds}` : "90-second sprint";

  if (hud.modeKind === "battle") {
    return {
      eyebrow: round,
      title: `${marker} Battle`,
      detail: "Load up or slam loaded rivals for combat points.",
      playerColor: you?.colorHex ?? "#ffffff",
      steps: [
        { label: "Load", detail: "Pull a haul" },
        { label: "Dash", detail: "Hit carriers" },
        { label: "Steal", detail: "Score off contact" },
      ],
    };
  }
  if (hud.modeKind === "king-magnet") {
    return {
      eyebrow: round,
      title: `${marker} King Magnet`,
      detail: "Hold the biggest cluster; the leader scores every 2 seconds.",
      playerColor: you?.colorHex ?? "#ffffff",
      steps: [
        { label: "Pull", detail: "Build biggest" },
        { label: "Protect", detail: "Avoid steals" },
        { label: "Score", detail: "Hold the crown" },
      ],
    };
  }
  if (hud.modeKind === "team-bank") {
    return {
      eyebrow: round,
      title: `${marker} Team Bank`,
      detail: "Bank at either team goal; your team shares points.",
      playerColor: you?.colorHex ?? "#ffffff",
      steps: [
        { label: "Pair", detail: "Share lanes" },
        { label: "Bank", detail: "Either goal" },
        { label: "Defend", detail: "Block steals" },
      ],
    };
  }
  if (hud.modeKind === "survival") {
    return {
      eyebrow: round,
      title: `${marker} Survival`,
      detail: "Three lives. Bank when safe, pulse near the rim.",
      playerColor: you?.colorHex ?? "#ffffff",
      steps: [
        { label: "Survive", detail: "Stay centered" },
        { label: "Pulse", detail: "Clear rivals" },
        { label: "Bank", detail: "Score safely" },
      ],
    };
  }
  return {
    eyebrow: round,
    title: `${marker} Classic`,
    detail: "Pull candy marbles, carry a haul, bank at your goal.",
    playerColor: you?.colorHex ?? "#ffffff",
    steps: [
      { label: "Pull", detail: "Hold magnet" },
      { label: "Carry", detail: "Keep the haul" },
      { label: "Bank", detail: "Reach your goal" },
    ],
  };
}

export function objectiveFor(hud: Hud, you: PlayerHud | undefined) {
  if (hud.tutorialStep === "collect") {
    return "Hold magnet near candy marbles to pull them in";
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
  if (you.bankStreak >= 2 && you.bankStreakBonus > 0 && you.bankStreakTimeLeft > 0 && you.cluster > 0) {
    return `Streak ${you.bankStreak}: bank fast for +${you.bankStreakBonus} per marble`;
  }
  if (hud.modeKind === "survival") {
    if (you.lives <= 1) return "Final life: avoid the rim and use pulses defensively";
    return "Survive the rim, steal safely, and outlast the table";
  }
  if (hud.modeKind === "team-bank") return "Bank at either team goal - your team shares points";
  const stealTarget = stealTargetFor(hud, you);
  if (hud.modeKind === "battle") return stealTarget && you.cluster <= 0 ? `Dash into loaded ${playerMarker(stealTarget.id)} to steal` : you.cluster >= 3 ? "Dash into carriers to steal and score" : "Collect a load or ram loaded rivals";
  if (hud.modeKind === "king-magnet") {
    return you.cluster >= 5 ? "Hold the biggest cluster to score every 2 seconds" : "Build the biggest cluster to become King Magnet";
  }
  if (stealTarget && you.cluster <= 0) return `Bump loaded ${playerMarker(stealTarget.id)} or build a haul`;
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

export function tutorialCoachStepsFor(hud: Hud): CoachStep[] {
  if (!hud.tutorialAssist || hud.tutorialStep === "off" || hud.tutorialStep === "done" || hud.tutorialComplete) return [];
  const carrying = hud.tutorialStep === "bank";
  return [
    {
      key: "pull",
      label: "Pull",
      detail: "Hold magnet",
      state: carrying ? "done" : "active",
    },
    {
      key: "carry",
      label: "Carry",
      detail: "Keep your haul",
      state: carrying ? "done" : "next",
    },
    {
      key: "bank",
      label: "Bank",
      detail: "Reach your goal",
      state: carrying ? "active" : "next",
    },
  ];
}
