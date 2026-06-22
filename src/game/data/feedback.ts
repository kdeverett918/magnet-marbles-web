import type { FxEvent, PowerupType } from "./types";

export type FeedbackTone = "score" | "combat" | "danger" | "power" | "paint";

export interface FeedbackMessage {
  title: string;
  detail: string;
  tone: FeedbackTone;
  priority: number;
}

export interface FeedbackToast extends FeedbackMessage {
  id: number;
}

export function feedbackForEvent(ev: FxEvent): FeedbackMessage | null {
  switch (ev.kind) {
    case "pickup":
    case "hit":
      return null;
    case "cluster":
      return {
        title: ev.count >= 18 ? "Cluster full" : ev.count >= 10 ? "Huge haul" : "Haul growing",
        detail: `${ev.count} carried - bank or risk it`,
        tone: "score",
        priority: ev.count >= 10 ? 3 : 1,
      };
    case "bank":
      return {
        title: ev.big ? "Huge bank" : "Banked",
        detail: ev.big ? "Big haul scored" : "Marbles scored",
        tone: "score",
        priority: ev.big ? 4 : 2,
      };
    case "steal":
      return {
        title: "Steal",
        detail: "Rival haul knocked loose",
        tone: "combat",
        priority: 5,
      };
    case "knockoff":
      return {
        title: "Rim out",
        detail: "Marbles dropped",
        tone: "danger",
        priority: 6,
      };
    case "paint":
      return {
        title: "Paint bonus",
        detail: "Your color banks for more",
        tone: "paint",
        priority: 3,
      };
    case "powerup":
      return {
        title: powerupTitle(ev.type),
        detail: "Powerup activated",
        tone: "power",
        priority: ev.type === "shockPulse" ? 5 : 3,
      };
    case "fall":
      return {
        title: "Fell off",
        detail: "Recover and rebuild",
        tone: "danger",
        priority: 4,
      };
  }
}

export function feedbackForEvents(events: readonly FxEvent[]): FeedbackMessage | null {
  let best: FeedbackMessage | null = null;
  for (const ev of events) {
    const next = feedbackForEvent(ev);
    if (!next) continue;
    if (!best || next.priority >= best.priority) best = next;
  }
  return best;
}

function powerupTitle(type: PowerupType) {
  switch (type) {
    case "magnetBurst":
      return "Magnet burst";
    case "shockPulse":
      return "Shock pulse";
    case "heavyCore":
      return "Heavy core";
    case "superMagnet":
      return "Super magnet";
    case "doubleScore":
      return "Double score";
    case "plusFive":
      return "Plus five";
    case "turbo":
      return "Turbo";
    case "disableMagnet":
      return "Magnet jam";
    case "paint":
      return "Paint bucket";
    default:
      return "Powerup";
  }
}
