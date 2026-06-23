import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { MODES } from "../data/config";
import { makeWorld, type World } from "./world";

const DT = 1 / 30;
const SIM_SECONDS_PER_RUN = 75;
const STEPS_PER_RUN = Math.round(SIM_SECONDS_PER_RUN / DT);
const SEEDS = [20260622, 440044];
const MIN_REALTIME_MULT = Number(process.env.SIM_PERF_MIN_REALTIME_MULT || 60);
const OUTPUT = process.env.SIM_PERFORMANCE_OUTPUT || "outputs/sim-performance-smoke.json";

interface RunSummary {
  mode: string;
  seed: number;
  elapsedMs: number;
  steps: number;
  simSeconds: number;
  realtimeMultiplier: number;
  maxCluster: number;
  maxScore: number;
  fxEvents: number;
}

function driveHuman(world: World, step: number) {
  const t = step * DT;
  const angle = t * 1.42 + world.humanId * 0.7;
  const moveMag = 0.62 + 0.38 * Math.abs(Math.sin(t * 0.49));
  world.setInput(world.humanId, {
    moveX: Math.cos(angle) * moveMag,
    moveZ: Math.sin(angle) * moveMag,
    magnet: step % 118 < 86,
    dash: step % 91 === 7,
    activate: step % 151 === 19,
  });
}

function runBudget(modeId: string, seed: number): RunSummary {
  const world = makeWorld(modeId, 4, seed, { tutorialAssist: seed === SEEDS[0], botDifficulty: "normal" });
  world.startMatch();
  world.forceAdvance();

  let maxCluster = 0;
  let maxScore = 0;
  let fxEvents = 0;
  const startedAt = performance.now();

  for (let step = 0; step < STEPS_PER_RUN; step++) {
    if (world.phase === "roundEnd" || world.phase === "intro") world.forceAdvance();
    if (world.phase === "matchEnd") {
      world.startMatch();
      world.forceAdvance();
    }
    if (world.phase === "playing") driveHuman(world, step);

    world.tick(DT);
    fxEvents += world.drainFx().length;
    for (const player of world.players) {
      maxCluster = Math.max(maxCluster, player.cluster.length);
      maxScore = Math.max(maxScore, player.score);
    }
  }

  const elapsedMs = Math.max(1, performance.now() - startedAt);
  return {
    mode: modeId,
    seed,
    elapsedMs: Math.round(elapsedMs),
    steps: STEPS_PER_RUN,
    simSeconds: SIM_SECONDS_PER_RUN,
    realtimeMultiplier: Number((SIM_SECONDS_PER_RUN / (elapsedMs / 1000)).toFixed(1)),
    maxCluster,
    maxScore,
    fxEvents,
  };
}

function writeReport(report: unknown) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
}

describe("No-browser simulation performance budget", () => {
  it("keeps all launch modes comfortably faster than real time under mixed bot and input pressure", () => {
    const runs: RunSummary[] = [];
    for (const mode of MODES) {
      for (const seed of SEEDS) runs.push(runBudget(mode.id, seed));
    }

    const totalElapsedMs = runs.reduce((sum, run) => sum + run.elapsedMs, 0);
    const totalSimSeconds = runs.reduce((sum, run) => sum + run.simSeconds, 0);
    const totalFxEvents = runs.reduce((sum, run) => sum + run.fxEvents, 0);
    const realtimeMultiplier = Number((totalSimSeconds / (Math.max(1, totalElapsedMs) / 1000)).toFixed(1));
    const slowest = [...runs].sort((a, b) => a.realtimeMultiplier - b.realtimeMultiplier)[0];
    const report = {
      pass: realtimeMultiplier >= MIN_REALTIME_MULT && totalFxEvents > 0,
      capturedAt: new Date().toISOString(),
      browserAutomation: false,
      budget: {
        minRealtimeMultiplier: MIN_REALTIME_MULT,
        simSecondsPerRun: SIM_SECONDS_PER_RUN,
        seeds: SEEDS,
      },
      summary: {
        runs: runs.length,
        totalSteps: runs.reduce((sum, run) => sum + run.steps, 0),
        totalSimSeconds,
        totalElapsedMs,
        realtimeMultiplier,
        totalFxEvents,
        maxCluster: Math.max(...runs.map((run) => run.maxCluster)),
        maxScore: Math.max(...runs.map((run) => run.maxScore)),
        slowest,
      },
      runs,
    };
    writeReport(report);

    expect(runs).toHaveLength(MODES.length * SEEDS.length);
    expect(totalFxEvents).toBeGreaterThan(0);
    expect(report.summary.maxCluster).toBeGreaterThan(0);
    expect(realtimeMultiplier).toBeGreaterThanOrEqual(MIN_REALTIME_MULT);
  }, 20_000);
});
