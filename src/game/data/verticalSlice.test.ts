import { describe, expect, it } from "vitest";
import {
  ADVANCED_POWERUPS,
  ALL_GAMEPLAY_POWERUPS,
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  CONFIG,
  CORE_POWERUPS,
  MODES,
  POWERUP_META,
} from "./config";
import { DEFAULT_PROGRESSION, TRAIL_COSMETICS, dailyChallengeFor, getTrailCosmetic } from "./progression";
import { makeWorld, type World } from "../sim/world";

const EXPECTED_MODES = ["classic", "battle", "king-magnet", "team-bank", "survival"] as const;
const MVP_POWERUPS = ["magnetBurst", "shockPulse", "heavyCore"] as const;

function advance(world: World, seconds: number) {
  const dt = 1 / 30;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) world.tick(dt);
}

describe("AA vertical slice contract", () => {
  it("keeps the requested five mode lineup with 90-second phone-friendly rounds", () => {
    expect(MODES.map((mode) => mode.id)).toEqual([...EXPECTED_MODES]);
    expect(MODES.every((mode) => mode.duration === 90)).toBe(true);

    expect(MODES.find((mode) => mode.id === "classic")).toMatchObject({
      name: "Classic",
      kind: "classic",
      rounds: 3,
      suddenDeath: true,
    });
    expect(MODES.find((mode) => mode.id === "battle")).toMatchObject({
      name: "Battle",
      kind: "battle",
      rounds: 3,
      suddenDeath: true,
    });
    expect(MODES.find((mode) => mode.id === "king-magnet")).toMatchObject({
      name: "King Magnet",
      kind: "king-magnet",
      rounds: 1,
      jumbo: true,
    });
    expect(MODES.find((mode) => mode.id === "team-bank")).toMatchObject({
      name: "Team Bank",
      kind: "team-bank",
      rounds: 3,
    });
    expect(MODES.find((mode) => mode.id === "survival")).toMatchObject({
      name: "Survival",
      kind: "survival",
      rounds: 1,
      lives: 3,
      suddenDeath: false,
    });
  });

  it("starts every mode as a 4-player one-human, three-bot marble match", () => {
    for (const mode of MODES) {
      const world = makeWorld(mode.id, 4, 20260622, { tutorialAssist: true });
      world.startMatch();

      expect(world.phase).toBe("intro");
      expect(world.roundTime).toBe(mode.duration);
      expect(world.players).toHaveLength(4);
      expect(world.players.filter((player) => !player.isBot)).toHaveLength(1);
      expect(world.players.filter((player) => player.isBot)).toHaveLength(3);
      expect(world.goals).toHaveLength(4);
      expect(world.marbles.length).toBeGreaterThanOrEqual(CONFIG.collectibleCount);
      expect(world.pickups).toHaveLength(CONFIG.powerups.spawnCount);

      if (mode.id === "team-bank") {
        expect(world.players.map((player) => player.teamId)).toEqual([0, 1, 0, 1]);
      }
      if (mode.id === "survival") {
        expect(world.players.map((player) => player.lives)).toEqual([3, 3, 3, 3]);
      }
    }
  });

  it("keeps the launch powerup pool focused on Magnet Burst, Shock Pulse, and Heavy Core", () => {
    expect(CORE_POWERUPS).toEqual([...MVP_POWERUPS]);
    const labels = MVP_POWERUPS.map((type) => POWERUP_META[type].label);
    expect(labels).toEqual(["Magnet Burst", "Shock Pulse", "Heavy Core"]);
    expect(POWERUP_META.magnetBurst.desc).toContain("Stronger pull");
    expect(POWERUP_META.shockPulse.desc).toContain("Knock loose");
    expect(POWERUP_META.heavyCore.desc).toContain("slower");

    const seen = new Set<string>();
    for (let seed = 1; seed <= 32; seed++) {
      const world = makeWorld("classic", 4, seed);
      world.startMatch();
      for (const pickup of world.pickups) {
        expect(MVP_POWERUPS).toContain(pickup.type as (typeof MVP_POWERUPS)[number]);
        seen.add(pickup.type);
      }
    }
    expect([...seen].sort()).toEqual([...MVP_POWERUPS].sort());
  });

  it("ramps advanced powerups after the first clean round", () => {
    const seenAdvanced = new Set<string>();
    for (let seed = 1; seed <= 160; seed++) {
      const world = makeWorld("classic", 4, seed);
      world.startMatch();

      world.round = 2;
      world.startRound();
      for (const pickup of world.pickups) {
        expect(ALL_GAMEPLAY_POWERUPS).toContain(pickup.type);
        if (ADVANCED_POWERUPS.includes(pickup.type)) seenAdvanced.add(pickup.type);
      }

      world.round = 3;
      world.startRound();
      for (const pickup of world.pickups) {
        expect(ALL_GAMEPLAY_POWERUPS).toContain(pickup.type);
        if (ADVANCED_POWERUPS.includes(pickup.type)) seenAdvanced.add(pickup.type);
      }
    }

    expect([...seenAdvanced].sort()).toEqual([...ADVANCED_POWERUPS].sort());
  });

  it("keeps the launch meta loop: six marble skin/trail cosmetics, stars, unlocks, and daily challenge", () => {
    expect(TRAIL_COSMETICS).toHaveLength(6);
    expect(TRAIL_COSMETICS[0]).toMatchObject({ id: "comet", cost: 0, skinColor: "#f24447" });
    expect(DEFAULT_PROGRESSION).toMatchObject({
      stars: 0,
      totalStarsEarned: 0,
      selectedTrail: "comet",
      unlockedTrails: ["comet"],
    });

    const costs = TRAIL_COSMETICS.map((trail) => trail.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(new Set(TRAIL_COSMETICS.map((trail) => trail.id)).size).toBe(TRAIL_COSMETICS.length);
    expect(new Set(TRAIL_COSMETICS.map((trail) => trail.skinColor)).size).toBe(TRAIL_COSMETICS.length);
    expect(new Set(TRAIL_COSMETICS.map((trail) => trail.skinAccent)).size).toBe(TRAIL_COSMETICS.length);
    expect(TRAIL_COSMETICS.every((trail) => trail.finish.length > 8)).toBe(true);
    expect(getTrailCosmetic("royal")).toMatchObject({ skinAccent: "#ffd76a", finish: "pearl prestige core" });

    for (let day = 21; day <= 27; day++) {
      const daily = dailyChallengeFor(new Date(`2026-06-${day}T12:00:00Z`));
      expect(EXPECTED_MODES).toContain(daily.modeId as (typeof EXPECTED_MODES)[number]);
      expect(daily.playerCount).toBe(4);
      expect(daily.rewardStars).toBeGreaterThanOrEqual(2);
      expect(daily.target.length).toBeGreaterThan(8);
    }
  });

  it("exposes three bot difficulty levels for solo tuning", () => {
    expect(Object.keys(BOT_DIFFICULTIES)).toEqual(["easy", "normal", "hard"]);
    expect(CONFIG.bot.difficulties).toBe(BOT_DIFFICULTIES);
    expect(BOT_DIFFICULTIES.easy.skillMult).toBeLessThan(BOT_DIFFICULTIES.normal.skillMult);
    expect(BOT_DIFFICULTIES.hard.skillMult).toBeGreaterThan(BOT_DIFFICULTIES.normal.skillMult);
  });

  it("gives the three solo bots distinct readable play styles", () => {
    const world = makeWorld("classic", 4, 20260622, { tutorialAssist: false });

    expect(Object.keys(BOT_PERSONALITIES)).toEqual(["collector", "bruiser", "banker"]);
    expect(CONFIG.bot.personalities).toBe(BOT_PERSONALITIES);
    expect(world.players.filter((player) => player.isBot).map((player) => player.botPersonality)).toEqual([
      "collector",
      "bruiser",
      "banker",
    ]);
    expect(BOT_PERSONALITIES.collector.bankWhenCluster).toBeGreaterThan(BOT_PERSONALITIES.banker.bankWhenCluster);
    expect(BOT_PERSONALITIES.bruiser.attackMult).toBeGreaterThan(BOT_PERSONALITIES.collector.attackMult);
    expect(BOT_PERSONALITIES.banker.retargetMult).toBeLessThan(BOT_PERSONALITIES.collector.retargetMult);
  });

  it("keeps the magnet/carry tuning readable and mastery-friendly", () => {
    expect(CONFIG.magnet.radius).toBeGreaterThan(CONFIG.player.radius * 4);
    expect(CONFIG.magnet.burstForceMult).toBeGreaterThan(1);
    expect(CONFIG.magnet.clusterCap).toBe(18);
    expect(CONFIG.carry.perRing).toBeGreaterThanOrEqual(6);
    expect(CONFIG.carry.speedPenaltyPerMarble).toBeGreaterThan(0);
    expect(CONFIG.carry.minSpeedMultiplier).toBeGreaterThanOrEqual(0.75);
    expect(CONFIG.bot.bankWhenCluster).toBeLessThan(CONFIG.magnet.clusterCap);
    expect(CONFIG.king.scoreEvery).toBe(2);
    expect(CONFIG.powerups.spawnCount).toBe(3);
    expect(CONFIG.bank.streakWindow).toBeGreaterThanOrEqual(6);
    expect(CONFIG.bank.streakMax).toBe(3);
  });

  it("proves the playable My Street-style core loop in the sim", () => {
    const world = makeWorld("classic", 4, 20260622, { tutorialAssist: true });
    world.startMatch();
    world.forceAdvance();

    expect(world.phase).toBe("playing");
    expect(world.players.filter((player) => player.isBot)).toHaveLength(3);

    const human = world.players[world.humanId];
    const targetMarble = world.marbles[0];
    for (const marble of world.marbles.slice(1)) {
      marble.state = "dead";
      marble.deadTimer = 999;
    }

    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };
    targetMarble.state = "free";
    targetMarble.carrier = -1;
    targetMarble.pos = { x: CONFIG.magnet.captureRadius * 0.45, z: 0 };
    targetMarble.vel = { x: 0, z: 0 };

    world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: true, dash: false, activate: false });
    world.tick(0.04);

    expect(human.vel.x).toBeGreaterThan(0);
    expect(human.magnetActive).toBe(true);
    expect(human.cluster).toEqual([targetMarble.id]);
    expect(targetMarble.state).toBe("carried");
    expect(targetMarble.carrier).toBe(human.id);

    const firstScore = human.score;
    human.pos = { ...world.goals[human.id].pos };
    human.vel = { x: 0, z: 0 };
    world.setInput(human.id, { moveX: 0, moveZ: 0, magnet: false, dash: false, activate: false });
    world.tick(0.08);

    expect(human.score).toBeGreaterThan(firstScore);
    expect(human.cluster).toHaveLength(0);
    expect(world.humanBankedThisMatch).toBe(true);

    const bot = world.players.find((player) => player.isBot);
    expect(bot).toBeTruthy();
    if (bot) {
      bot.botTimer = 0;
      bot.pos = { x: 0, z: 0 };
      bot.vel = { x: 0, z: 0 };
      world.tick(0.04);
      expect(Math.hypot(bot.moveX, bot.moveZ)).toBeGreaterThan(0);
      expect(["collect", "bank", "attack"]).toContain(bot.botState);
    }

    let guard = 0;
    while (world.phase !== "matchEnd" && guard < 16) {
      guard++;
      if (world.phase === "intro" || world.phase === "roundEnd") {
        world.forceAdvance();
        continue;
      }
      if (world.phase === "playing") {
        for (const player of world.players) player.score = player.id === human.id ? world.round * 10 : 0;
        world.roundTime = 0.01;
        advance(world, 0.08);
      }
    }

    expect(world.phase).toBe("matchEnd");
    expect(world.winnerId).toBe(human.id);

    const rematch = makeWorld("classic", 4, 20260623, { tutorialAssist: false });
    rematch.startMatch();
    expect(rematch.phase).toBe("intro");
    expect(rematch.players).toHaveLength(4);
    expect(rematch.players[rematch.humanId].score).toBe(0);
  });
});
