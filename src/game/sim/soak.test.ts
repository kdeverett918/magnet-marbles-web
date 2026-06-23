import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_GAMEPLAY_POWERUPS, CONFIG, MODES } from "../data/config";
import type { Marble, Player, RoundPhase } from "../data/types";
import { makeWorld, type World } from "./world";

const DT = 1 / 30;
const SOAK_SECONDS = 180;
const SOAK_STEPS = Math.round(SOAK_SECONDS / DT);
const SEEDS = [20260622, 918273, 440044];
const PHASES: RoundPhase[] = ["intro", "playing", "roundEnd", "matchEnd"];
const SOAK_OUTPUT = process.env.SIM_SOAK_OUTPUT;

function writeSoakReport(report: unknown) {
  if (!SOAK_OUTPUT) return;
  mkdirSync(dirname(SOAK_OUTPUT), { recursive: true });
  writeFileSync(SOAK_OUTPUT, JSON.stringify(report, null, 2));
}

function expectFinite(value: number, label: string) {
  expect(Number.isFinite(value), label).toBe(true);
}

function expectFinitePlayer(player: Player) {
  expectFinite(player.pos.x, `player ${player.id} pos.x`);
  expectFinite(player.pos.z, `player ${player.id} pos.z`);
  expectFinite(player.vel.x, `player ${player.id} vel.x`);
  expectFinite(player.vel.z, `player ${player.id} vel.z`);
  expectFinite(player.y, `player ${player.id} y`);
  expectFinite(player.vy, `player ${player.id} vy`);
  expectFinite(player.score, `player ${player.id} score`);
  expectFinite(player.respawnTimer, `player ${player.id} respawnTimer`);
  expectFinite(player.dashCooldown, `player ${player.id} dashCooldown`);
  expectFinite(player.dashTimer, `player ${player.id} dashTimer`);
}

function expectFiniteMarble(marble: Marble) {
  expectFinite(marble.pos.x, `marble ${marble.id} pos.x`);
  expectFinite(marble.pos.z, `marble ${marble.id} pos.z`);
  expectFinite(marble.vel.x, `marble ${marble.id} vel.x`);
  expectFinite(marble.vel.z, `marble ${marble.id} vel.z`);
  expectFinite(marble.y, `marble ${marble.id} y`);
  expectFinite(marble.vy, `marble ${marble.id} vy`);
  expectFinite(marble.deadTimer, `marble ${marble.id} deadTimer`);
}

function expectWorldIntegrity(world: World) {
  expect(PHASES).toContain(world.phase);
  expect(world.players).toHaveLength(4);
  expect(world.goals).toHaveLength(4);
  expect(world.marbles.length).toBeGreaterThanOrEqual(CONFIG.collectibleCount);
  expect(world.pickups.length).toBeLessThanOrEqual(CONFIG.powerups.spawnCount);
  expect(world.round).toBeGreaterThanOrEqual(1);
  expect(world.round).toBeLessThanOrEqual(world.mode.rounds);
  expect(world.roundTime).toBeGreaterThanOrEqual(0);
  expectFinite(world.time, "world time");
  expectFinite(world.roundTime, "round time");
  expectFinite(world.introCountdown, "intro countdown");

  const marbleById = new Map(world.marbles.map((marble) => [marble.id, marble]));
  const carried = new Set<number>();

  for (const player of world.players) {
    expectFinitePlayer(player);
    expect(player.cluster.length).toBeLessThanOrEqual(CONFIG.magnet.clusterCap);
    expect(["search", "collect", "bank", "attack", "recover"]).toContain(player.botState);
    if (world.mode.kind === "survival") {
      expect(player.lives).toBeGreaterThanOrEqual(0);
      expect(player.lives).toBeLessThanOrEqual(world.mode.lives ?? 3);
    }

    for (const marbleId of player.cluster) {
      expect(carried.has(marbleId), `duplicate carried marble ${marbleId}`).toBe(false);
      carried.add(marbleId);
      const marble = marbleById.get(marbleId);
      expect(marble, `player ${player.id} references missing marble ${marbleId}`).toBeTruthy();
      expect(marble?.state).toBe("carried");
      expect(marble?.carrier).toBe(player.id);
    }
  }

  for (const marble of world.marbles) {
    expectFiniteMarble(marble);
    if (marble.state === "carried") {
      expect(carried.has(marble.id), `carried marble ${marble.id} missing from carrier cluster`).toBe(true);
      expect(marble.carrier).toBeGreaterThanOrEqual(0);
      expect(marble.carrier).toBeLessThan(world.players.length);
    } else {
      expect(marble.carrier).toBe(-1);
    }
  }

  for (const pickup of world.pickups) {
    expectFinite(pickup.pos.x, `pickup ${pickup.id} pos.x`);
    expectFinite(pickup.pos.z, `pickup ${pickup.id} pos.z`);
    expectFinite(pickup.respawnTimer, `pickup ${pickup.id} respawnTimer`);
    expectFinite(pickup.bob, `pickup ${pickup.id} bob`);
    expect(ALL_GAMEPLAY_POWERUPS).toContain(pickup.type);
  }

  for (const button of world.buttons) {
    expectFinite(button.pos.x, `button ${button.id} pos.x`);
    expectFinite(button.pos.z, `button ${button.id} pos.z`);
    expectFinite(button.cooldown, `button ${button.id} cooldown`);
    expectFinite(button.pressedFlash, `button ${button.id} pressedFlash`);
    expect(button.targetGoalOwnerId).toBeGreaterThanOrEqual(0);
    expect(button.targetGoalOwnerId).toBeLessThan(world.goals.length);
  }

  for (const ring of world.rings) {
    expectFinite(ring.pos.x, `ring ${ring.id} pos.x`);
    expectFinite(ring.pos.z, `ring ${ring.id} pos.z`);
    expectFinite(ring.radius, `ring ${ring.id} radius`);
    expectFinite(ring.spin, `ring ${ring.id} spin`);
    expect(ring.targetGoalOwnerId).toBeGreaterThanOrEqual(0);
    expect(ring.targetGoalOwnerId).toBeLessThan(world.goals.length);
  }
}

function driveHuman(world: World, step: number) {
  const t = step * DT;
  const angle = t * 1.35 + world.humanId * 0.7;
  const pulse = Math.sin(t * 0.55);
  const moveMag = 0.55 + 0.45 * Math.abs(pulse);
  world.setInput(world.humanId, {
    moveX: Math.cos(angle) * moveMag,
    moveZ: Math.sin(angle) * moveMag,
    magnet: step % 120 < 92,
    dash: step % 96 === 8,
    activate: step % 145 === 21,
  });
}

function runSoak(modeId: string, seed: number) {
  const world = makeWorld(modeId, 4, seed, { tutorialAssist: seed === SEEDS[0] });
  world.startMatch();
  world.forceAdvance();

  const stats = {
    maxScore: 0,
    maxCluster: 0,
    bankFx: 0,
    pickupFx: 0,
    hitFx: 0,
    phaseTransitions: 0,
    matchEndSeen: false,
    lastPhase: world.phase,
  };

  for (let step = 0; step < SOAK_STEPS; step++) {
    if (world.phase === "roundEnd" || world.phase === "intro") world.forceAdvance();
    if (world.phase === "playing") driveHuman(world, step);

    world.tick(DT);

    if (world.phase !== stats.lastPhase) {
      stats.phaseTransitions++;
      stats.lastPhase = world.phase;
    }
    if (world.phase === "matchEnd") {
      stats.matchEndSeen = true;
      world.startMatch();
      world.forceAdvance();
      stats.lastPhase = world.phase;
    }

    for (const player of world.players) {
      stats.maxScore = Math.max(stats.maxScore, player.score);
      stats.maxCluster = Math.max(stats.maxCluster, player.cluster.length);
    }
    for (const fx of world.drainFx()) {
      if (fx.kind === "bank") stats.bankFx++;
      if (fx.kind === "pickup" || fx.kind === "powerup") stats.pickupFx++;
      if (fx.kind === "hit" || fx.kind === "steal" || fx.kind === "knockoff") stats.hitFx++;
    }
    if (step % 120 === 0) expectWorldIntegrity(world);
  }

  expectWorldIntegrity(world);
  expect(stats.phaseTransitions, `${modeId}/${seed} should exercise round flow`).toBeGreaterThan(0);
  expect(stats.maxCluster, `${modeId}/${seed} should carry at least one marble`).toBeGreaterThan(0);
  expect(stats.maxScore + stats.bankFx, `${modeId}/${seed} should score or emit bank feedback`).toBeGreaterThan(0);
  expect(stats.pickupFx + stats.hitFx + stats.bankFx, `${modeId}/${seed} should emit gameplay feedback`).toBeGreaterThan(0);
  return stats;
}

describe("Long deterministic simulation soak", () => {
  it("keeps every launch mode stable under mixed human, bot, powerup, obstacle, and round-flow pressure", () => {
    const aggregate = {
      modeRuns: 0,
      matchEnds: 0,
      banks: 0,
      pickups: 0,
      hits: 0,
    };
    const runs: Array<ReturnType<typeof runSoak> & { modeId: string; seed: number }> = [];

    for (const mode of MODES) {
      for (const seed of SEEDS) {
        const stats = runSoak(mode.id, seed);
        runs.push({ modeId: mode.id, seed, ...stats });
        aggregate.modeRuns++;
        aggregate.matchEnds += stats.matchEndSeen ? 1 : 0;
        aggregate.banks += stats.bankFx;
        aggregate.pickups += stats.pickupFx;
        aggregate.hits += stats.hitFx;
      }
    }

    expect(aggregate.modeRuns).toBe(MODES.length * SEEDS.length);
    expect(aggregate.matchEnds).toBeGreaterThan(0);
    expect(aggregate.banks).toBeGreaterThan(0);
    expect(aggregate.pickups).toBeGreaterThan(0);
    expect(aggregate.hits).toBeGreaterThan(0);

    writeSoakReport({
      pass: true,
      capturedAt: new Date().toISOString(),
      browserAutomation: false,
      modes: MODES.map((mode) => mode.id),
      seeds: SEEDS,
      secondsPerRun: SOAK_SECONDS,
      stepsPerRun: SOAK_STEPS,
      totalSimSeconds: aggregate.modeRuns * SOAK_SECONDS,
      totalSteps: aggregate.modeRuns * SOAK_STEPS,
      aggregate,
      runs,
    });
  }, 20_000);
});
