import { describe, expect, it } from "vitest";
import { feedbackForEvent, feedbackForEvents } from "./feedback";

describe("feedback messages", () => {
  it("ignores spammy pickup and minor hit events", () => {
    expect(feedbackForEvent({ kind: "pickup", x: 0, z: 0, color: "#fff" })).toBeNull();
    expect(feedbackForEvent({ kind: "hit", x: 0, z: 0 })).toBeNull();
  });

  it("surfaces banks, steals, knockoffs, and powerups as readable reward callouts", () => {
    expect(feedbackForEvent({ kind: "bank", x: 0, z: 0, color: "#fff", big: true })).toMatchObject({
      title: "Huge bank",
      tone: "score",
    });
    expect(feedbackForEvent({ kind: "steal", x: 0, z: 0, color: "#f44" })).toMatchObject({
      title: "Steal",
      tone: "combat",
    });
    expect(feedbackForEvent({ kind: "knockoff", x: 0, z: 0 })).toMatchObject({
      title: "Rim out",
      tone: "danger",
    });
    expect(feedbackForEvent({ kind: "powerup", x: 0, z: 0, type: "shockPulse" })).toMatchObject({
      title: "Shock pulse",
      tone: "power",
    });
    expect(feedbackForEvent({ kind: "bankStreak", x: 0, z: 0, color: "#fff", streak: 2, bonus: 1 })).toMatchObject({
      title: "Bank streak 2",
      detail: "Quick return: +1 per marble",
      tone: "score",
      priority: 5,
    });
  });

  it("surfaces carried-cluster milestones without making every pickup noisy", () => {
    expect(feedbackForEvent({ kind: "cluster", x: 0, z: 0, color: "#fff", count: 6 })).toMatchObject({
      title: "Haul growing",
      detail: "6 carried - bank or risk it",
      tone: "score",
      priority: 1,
    });
    expect(feedbackForEvent({ kind: "cluster", x: 0, z: 0, color: "#fff", count: 18 })).toMatchObject({
      title: "Cluster full",
      priority: 3,
    });
  });

  it("chooses the highest-priority callout from a busy frame", () => {
    const feedback = feedbackForEvents([
      { kind: "bank", x: 0, z: 0, color: "#fff", big: false },
      { kind: "pickup", x: 0, z: 0, color: "#fff" },
      { kind: "knockoff", x: 0, z: 0 },
      { kind: "powerup", x: 0, z: 0, type: "magnetBurst" },
    ]);

    expect(feedback).toMatchObject({ title: "Rim out", priority: 6 });
  });
});
