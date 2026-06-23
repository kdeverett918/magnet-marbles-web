import { describe, expect, it } from "vitest";
import { makeWorld, type World } from "./world";
import {
  ADVANCED_POWERUPS,
  ALL_GAMEPLAY_POWERUPS,
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  CONFIG,
  CORE_POWERUPS,
  MID_MATCH_POWERUPS,
  MODES,
} from "../data/config";
import { buildSnapshot } from "../net/snapshot";
import { NetView } from "../net/NetView";

function startPlaying(tutorialAssist: boolean): World {
  const world = makeWorld("classic", 4, 12345, { tutorialAssist });
  world.startMatch();
  world.forceAdvance();
  return world;
}

function advance(world: World, seconds: number) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) world.tick(dt);
}

function stageCarriedMarble(world: World, playerId: number) {
  stageCarriedMarbles(world, playerId, 1);
}

function stageCarriedMarbles(world: World, playerId: number, count: number, painted = false, start = 0) {
  const player = world.players[playerId];
  player.cluster = [];
  for (let i = 0; i < count; i++) {
    const marble = world.marbles[start + i];
    marble.state = "carried";
    marble.carrier = playerId;
    marble.value = 1;
    marble.isJumbo = false;
    marble.painted = painted;
    marble.paintedBy = painted ? playerId : -1;
    if (painted) marble.colorHex = player.colorHex;
    marble.vel = { x: 0, z: 0 };
    player.cluster.push(marble.id);
  }
  player.vel = { x: 0, z: 0 };
  player.pos = { ...world.goals[playerId].pos };
}

function marbleSignature(world: World) {
  return world.marbles.slice(0, 8).map((m) => ({
    x: Number(m.pos.x.toFixed(4)),
    z: Number(m.pos.z.toFixed(4)),
    color: m.colorHex,
    jumbo: m.isJumbo,
  }));
}

function expectFiniteNumber(value: number, label: string) {
  expect(Number.isFinite(value), label).toBe(true);
}

function sustainedMoveSpeedWithCluster(clusterCount: number): number {
  const world = startPlaying(false);
  for (const p of world.players) p.isBot = false;
  const human = world.players[world.humanId];
  for (const marble of world.marbles) {
    marble.state = "dead";
    marble.carrier = -1;
    marble.deadTimer = 999;
  }
  if (clusterCount > 0) stageCarriedMarbles(world, human.id, clusterCount);
  human.pos = { x: 0, z: 0 };
  human.vel = { x: 0, z: 0 };

  world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: false, dash: false, activate: false });
  advance(world, 0.65);

  return Math.hypot(human.vel.x, human.vel.z);
}

function assertWorldIntegrity(world: World) {
  const carriedIds = new Set<number>();
  const byId = new Map(world.marbles.map((marble) => [marble.id, marble]));

  expect(world.players.length).toBeGreaterThanOrEqual(2);
  expect(world.players.length).toBeLessThanOrEqual(4);
  expect(world.marbles.length).toBeGreaterThan(0);
  expect(["intro", "playing", "roundEnd", "matchEnd"]).toContain(world.phase);

  for (const player of world.players) {
    expectFiniteNumber(player.pos.x, `player ${player.id} pos.x`);
    expectFiniteNumber(player.pos.z, `player ${player.id} pos.z`);
    expectFiniteNumber(player.vel.x, `player ${player.id} vel.x`);
    expectFiniteNumber(player.vel.z, `player ${player.id} vel.z`);
    expectFiniteNumber(player.y, `player ${player.id} y`);
    expectFiniteNumber(player.vy, `player ${player.id} vy`);
    expect(player.score).toBeGreaterThanOrEqual(0);
    expect(player.cluster.length).toBeLessThanOrEqual(CONFIG.magnet.clusterCap);
    for (const marbleId of player.cluster) {
      expect(carriedIds.has(marbleId), `duplicate carried marble ${marbleId}`).toBe(false);
      carriedIds.add(marbleId);
      const marble = byId.get(marbleId);
      expect(marble, `missing carried marble ${marbleId}`).toBeTruthy();
      expect(marble?.state).toBe("carried");
      expect(marble?.carrier).toBe(player.id);
    }
  }

  for (const marble of world.marbles) {
    expectFiniteNumber(marble.pos.x, `marble ${marble.id} pos.x`);
    expectFiniteNumber(marble.pos.z, `marble ${marble.id} pos.z`);
    expectFiniteNumber(marble.vel.x, `marble ${marble.id} vel.x`);
    expectFiniteNumber(marble.vel.z, `marble ${marble.id} vel.z`);
    expectFiniteNumber(marble.y, `marble ${marble.id} y`);
    expectFiniteNumber(marble.vy, `marble ${marble.id} vy`);
    expectFiniteNumber(marble.deadTimer, `marble ${marble.id} deadTimer`);
    if (marble.state === "carried") {
      expect(carriedIds.has(marble.id), `carried marble ${marble.id} missing from carrier cluster`).toBe(true);
    } else {
      expect(marble.carrier).toBe(-1);
    }
  }
}

describe("World tutorial assist", () => {
  it("caps early bot banking until the player has had a fair first bank chance", () => {
    const assisted = startPlaying(true);
    assisted.players[1].score = 8;
    stageCarriedMarble(assisted, 1);

    assisted.tick(0.08);

    expect(assisted.players[1].score).toBe(8);
    expect(assisted.players[1].cluster).toHaveLength(1);

    const normal = startPlaying(false);
    normal.players[1].score = 8;
    stageCarriedMarble(normal, 1);

    normal.tick(0.08);

    expect(normal.players[1].score).toBeGreaterThan(8);
    expect(normal.players[1].cluster).toHaveLength(0);
  });

  it("marks the tutorial complete only after the human banks a carried marble", () => {
    const world = startPlaying(true);
    stageCarriedMarble(world, world.humanId);

    world.tick(0.08);

    expect(world.humanBankedThisMatch).toBe(true);
    expect(world.players[world.humanId].score).toBeGreaterThan(0);
  });

  it("caps early bot instant-score powerups during tutorial assist", () => {
    const world = startPlaying(true);
    const bot = world.players[1];
    bot.score = 8;
    bot.heldPowerup = "plusFive";

    world.tick(0.08);

    expect(bot.score).toBe(8);
  });
});

describe("World launch-critical mechanics", () => {
  it("exposes the requested My Street-style mode set", () => {
    expect(MODES.map((mode) => mode.id)).toEqual(["classic", "battle", "king-magnet", "team-bank", "survival"]);
  });

  it("spawns only the three vertical-slice powerups in the first round", () => {
    const world = startPlaying(false);

    expect(world.pickups.map((pickup) => pickup.type).every((type) => CORE_POWERUPS.includes(type))).toBe(true);
  });

  it("ramps richer powerup pools in later rounds", () => {
    const world = makeWorld("classic", 4, 54321);
    world.startMatch();

    world.round = 2;
    world.startRound();
    expect(world.pickups.map((pickup) => pickup.type).every((type) => MID_MATCH_POWERUPS.includes(type))).toBe(true);

    const seenAdvanced = new Set<string>();
    for (let seed = 1; seed <= 160; seed++) {
      const seeded = makeWorld("classic", 4, seed);
      seeded.startMatch();
      seeded.round = 3;
      seeded.startRound();

      for (const pickup of seeded.pickups) {
        expect(ALL_GAMEPLAY_POWERUPS).toContain(pickup.type);
        if (ADVANCED_POWERUPS.includes(pickup.type)) seenAdvanced.add(pickup.type);
      }
    }
    expect([...seenAdvanced].sort()).toEqual([...ADVANCED_POWERUPS].sort());
  });

  it("spawns deterministic marble layouts for the same seed", () => {
    const a = startPlaying(false);
    const b = startPlaying(false);

    expect(marbleSignature(a)).toEqual(marbleSignature(b));
  });

  it("transfers carried marbles from a victim to the faster bumper", () => {
    const world = startPlaying(false);
    const attacker = world.players[0];
    const victim = world.players[1];
    stageCarriedMarbles(world, victim.id, 6);
    victim.isBot = false;
    for (const marble of world.marbles.slice(6)) marble.state = "dead";

    attacker.pos = { x: 0, z: 0 };
    victim.pos = { x: 1.3, z: 0 };
    attacker.vel = { x: 8.5, z: 0 };
    victim.vel = { x: 0, z: 0 };
    attacker.lastBumpFx = -1;

    world.tick(0.02);

    expect(attacker.cluster).toHaveLength(2);
    expect(victim.cluster).toHaveLength(4);
    for (const id of attacker.cluster) {
      expect(world.marbles.find((m) => m.id === id)?.carrier).toBe(attacker.id);
    }
  });

  it("battle mode scores successful steal impacts", () => {
    const world = makeWorld("battle", 4, 4242);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    const attacker = world.players[0];
    const victim = world.players[1];
    stageCarriedMarbles(world, victim.id, 6);
    for (const marble of world.marbles.slice(6)) marble.state = "dead";

    attacker.pos = { x: 0, z: 0 };
    victim.pos = { x: 1.3, z: 0 };
    attacker.vel = { x: 8.5, z: 0 };
    victim.vel = { x: 0, z: 0 };
    attacker.lastBumpFx = -1;

    world.tick(0.02);

    expect(attacker.cluster.length).toBeGreaterThan(0);
    expect(attacker.score).toBeGreaterThan(0);
  });

  it("king magnet awards recurring points to the unique largest carrier", () => {
    const world = makeWorld("king-magnet", 4, 4321);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    const king = world.players[0];
    stageCarriedMarbles(world, king.id, CONFIG.king.minCluster);
    king.pos = { x: 0, z: 0 };
    king.vel = { x: 0, z: 0 };

    advance(world, CONFIG.king.scoreEvery + 0.2);

    expect(king.score).toBeGreaterThan(0);
  });

  it("team bank allows scoring at a teammate goal and shares points", () => {
    const world = makeWorld("team-bank", 4, 5151);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    stageCarriedMarbles(world, human.id, 1);
    human.pos = { ...world.goals[2].pos };

    world.tick(0.08);

    expect(world.players[0].score).toBe(1);
    expect(world.players[2].score).toBe(1);
    expect(world.players[1].score).toBe(0);
    expect(world.players[3].score).toBe(0);
  });

  it("team bank sudden death compares teams instead of tied teammates", () => {
    const world = makeWorld("team-bank", 4, 5252);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    world.players[0].score = 8;
    world.players[2].score = 8;
    world.players[1].score = 6;
    world.players[3].score = 6;
    world.roundTime = 0.01;

    world.tick(0.08);

    expect(world.phase).toBe("roundEnd");
    expect(world.suddenDeath).toBe(false);
  });

  it("team bank sudden death stays alive only while teams are tied", () => {
    const world = makeWorld("team-bank", 4, 5353);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    for (const p of world.players) p.score = 7;
    world.roundTime = 0.01;

    world.tick(0.08);

    expect(world.phase).toBe("playing");
    expect(world.suddenDeath).toBe(true);

    world.players[0].score = 8;
    world.players[2].score = 8;
    world.tick(0.08);

    expect(world.phase).toBe("roundEnd");
  });

  it("survival spends lives on falls instead of endless respawns", () => {
    const world = makeWorld("survival", 4, 6161);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    const player = world.players[0];
    player.pos = { x: CONFIG.tableRadius + 0.5, z: 0 };
    player.vel = { x: CONFIG.rimEscapeSpeed + 4, z: 0 };

    advance(world, 1.1);

    expect(player.lives).toBe(2);
    expect(player.alive).toBe(false);
    expect(player.respawnTimer).toBeGreaterThan(0);
  });

  it("survival timer winners are chosen by lives before score", () => {
    const world = makeWorld("survival", 4, 6262);
    world.startMatch();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    world.players[0].lives = 1;
    world.players[0].score = 40;
    world.players[1].lives = 2;
    world.players[1].score = 2;
    world.players[2].lives = 1;
    world.players[2].score = 15;
    world.players[3].lives = 0;
    world.players[3].score = 80;
    world.roundTime = 0.01;

    world.tick(0.08);
    expect(world.phase).toBe("roundEnd");

    world.forceAdvance();
    expect(world.phase).toBe("matchEnd");
    expect(world.winnerId).toBe(1);
  });

  it("keeps a tied sudden-death round alive and ends once the tie breaks", () => {
    const world = makeWorld("classic", 2, 6789);
    world.startMatch();
    world.forceAdvance();
    world.players[0].score = 5;
    world.players[1].score = 5;
    world.roundTime = 0.01;

    world.tick(0.08);

    expect(world.phase).toBe("playing");
    expect(world.suddenDeath).toBe(true);

    world.players[0].score = 6;
    world.tick(0.08);

    expect(world.phase).toBe("roundEnd");
  });

  it("applies paint and double-score modifiers when banking", () => {
    const world = startPlaying(false);
    const human = world.players[world.humanId];
    stageCarriedMarbles(world, human.id, 1, true);
    human.activeUntil.doubleScore = world.time + 5;

    world.tick(0.08);

    expect(human.score).toBe(4);
    expect(human.cluster).toHaveLength(0);
  });

  it("rewards fast repeat bank runs with a short-lived streak bonus", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[world.humanId];

    stageCarriedMarbles(world, human.id, 2);
    world.tick(0.1);

    expect(human.score).toBe(2);
    expect(human.bankStreak).toBe(1);
    expect(human.cluster).toHaveLength(0);

    stageCarriedMarbles(world, human.id, 2);
    world.tick(0.1);

    expect(human.score).toBe(6);
    expect(human.bankStreak).toBe(2);
    expect(world.drainFx()).toContainEqual(expect.objectContaining({
      kind: "bankStreak",
      streak: 2,
      bonus: 1,
    }));

    advance(world, CONFIG.bank.streakWindow + 0.2);
    expect(human.bankStreak).toBe(0);

    stageCarriedMarbles(world, human.id, 2);
    world.tick(0.1);

    expect(human.score).toBe(8);
    expect(human.bankStreak).toBe(1);
  });

  it("magnet burst activates as a short stronger pull buff", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    human.heldPowerup = "magnetBurst";
    human.wantActivate = true;

    world.tick(0.04);

    expect(human.heldPowerup).toBeNull();
    expect(human.activeUntil.magnetBurst).toBeGreaterThan(world.time);
  });

  it("captures nearby marbles only while the held magnet is usable", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    const marble = world.marbles[0];
    for (const other of world.marbles.slice(1)) {
      other.state = "dead";
      other.deadTimer = 999;
    }
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };
    marble.state = "free";
    marble.carrier = -1;
    marble.pos = { x: CONFIG.magnet.captureRadius * 0.45, z: 0 };
    marble.vel = { x: 0, z: 0 };
    human.activeUntil.disableMagnet = world.time + 0.5;

    world.setInput(human.id, { moveX: 0, moveZ: 0, magnet: true, dash: false, activate: false });
    world.tick(0.04);

    expect(human.magnetActive).toBe(false);
    expect(human.cluster).toHaveLength(0);
    expect(marble.state).toBe("free");

    advance(world, 0.6);

    expect(human.magnetActive).toBe(true);
    expect(human.cluster).toEqual([marble.id]);
    expect(marble.state).toBe("carried");
    expect(marble.carrier).toBe(human.id);
  });

  it("emits cluster milestone feedback only at satisfying carried thresholds", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[world.humanId];
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };

    for (let i = 0; i < 6; i++) {
      const marble = world.marbles[i];
      marble.state = "free";
      marble.carrier = -1;
      marble.y = 0;
      marble.vy = 0;
      marble.pos = { x: 0.22 + i * 0.03, z: 0.24 };
      marble.vel = { x: 0, z: 0 };
    }
    for (const marble of world.marbles.slice(6)) {
      marble.state = "dead";
      marble.carrier = -1;
      marble.deadTimer = 999;
    }

    world.setInput(human.id, { moveX: 0, moveZ: 0, magnet: true, dash: false, activate: false });
    world.tick(0.04);
    const fx = world.drainFx();

    expect(human.cluster).toHaveLength(6);
    expect(fx.filter((ev) => ev.kind === "pickup")).toHaveLength(6);
    expect(fx.filter((ev) => ev.kind === "cluster").map((ev) => ev.count)).toEqual([3, 6]);
  });

  it("slightly slows full carried hauls while preserving responsive control", () => {
    const emptySpeed = sustainedMoveSpeedWithCluster(0);
    const fullHaulSpeed = sustainedMoveSpeedWithCluster(CONFIG.magnet.clusterCap);

    expect(CONFIG.carry.speedPenaltyPerMarble).toBeGreaterThan(0);
    expect(CONFIG.carry.minSpeedMultiplier).toBeGreaterThanOrEqual(0.75);
    expect(fullHaulSpeed).toBeLessThan(emptySpeed * 0.86);
    expect(fullHaulSpeed).toBeGreaterThan(emptySpeed * 0.72);
  });

  it("treats dash as a one-frame press gated by cooldown", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };

    world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: false, dash: true, activate: false });
    world.tick(0.04);
    const firstCooldown = human.dashCooldown;

    expect(human.dashTimer).toBeGreaterThan(0);
    expect(firstCooldown).toBeGreaterThan(CONFIG.player.dashDuration);
    expect(human.vel.x).toBeGreaterThan(CONFIG.player.moveSpeed * 0.2);

    world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: false, dash: false, activate: false });
    advance(world, CONFIG.player.dashDuration + 0.08);
    expect(human.dashTimer).toBeLessThanOrEqual(0);
    expect(human.dashCooldown).toBeGreaterThan(0);

    world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: false, dash: true, activate: false });
    world.tick(0.04);

    expect(human.dashTimer).toBeLessThanOrEqual(0);
    expect(human.dashCooldown).toBeGreaterThan(0);
    expect(human.dashCooldown).toBeLessThan(firstCooldown);
  });

  it("dashes from neutral using the last movement direction", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };

    world.setInput(human.id, { moveX: 1, moveZ: 0, magnet: false, dash: false, activate: false });
    world.tick(0.08);
    expect(human.lastMoveX).toBeGreaterThan(0.99);
    expect(human.lastMoveZ).toBeCloseTo(0);

    world.setInput(human.id, { moveX: 0, moveZ: 0, magnet: false, dash: true, activate: false });
    world.tick(0.04);

    expect(human.dashTimer).toBeGreaterThan(0);
    expect(human.dashCooldown).toBeGreaterThan(CONFIG.player.dashDuration);
    expect(human.dashDirX).toBeGreaterThan(0.99);
    expect(human.vel.x).toBeGreaterThan(0);
  });

  it("does not spend dash cooldown when no direction has ever been given", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };

    world.setInput(human.id, { moveX: 0, moveZ: 0, magnet: false, dash: true, activate: false });
    world.tick(0.04);

    expect(human.dashTimer).toBe(0);
    expect(human.dashCooldown).toBe(0);
    expect(human.dashDirX).toBe(0);
    expect(human.dashDirZ).toBe(0);
  });

  it("sanitizes malformed player input before it can corrupt physics", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const human = world.players[0];
    human.pos = { x: 0, z: 0 };
    human.vel = { x: 0, z: 0 };

    world.setInput(human.id, {
      moveX: Number.POSITIVE_INFINITY,
      moveZ: Number.NaN,
      magnet: true,
      dash: "true" as unknown as boolean,
      activate: "true" as unknown as boolean,
    });
    world.tick(0.04);

    expect(human.moveX).toBe(0);
    expect(human.moveZ).toBe(0);
    expect(human.magnetActive).toBe(true);
    expect(human.dashTimer).toBe(0);
    expectFiniteNumber(human.pos.x, "human pos.x after malformed input");
    expectFiniteNumber(human.pos.z, "human pos.z after malformed input");

    world.setInput(human.id, { moveX: 9, moveZ: -9, magnet: false, dash: true, activate: false });
    world.tick(0.04);

    expect(human.moveX).toBe(1);
    expect(human.moveZ).toBe(-1);
    expect(human.dashTimer).toBeGreaterThan(0);
    expectFiniteNumber(human.vel.x, "human vel.x after clamped input");
    expectFiniteNumber(human.vel.z, "human vel.z after clamped input");
  });

  it("shock pulse knocks loose nearby enemy carried marbles", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const caster = world.players[0];
    const victim = world.players[1];
    caster.pos = { x: 0, z: 0 };
    victim.pos = { x: 2, z: 0 };
    stageCarriedMarbles(world, victim.id, 4);
    victim.pos = { x: 2, z: 0 };
    caster.heldPowerup = "shockPulse";
    caster.wantActivate = true;

    world.tick(0.04);

    expect(victim.cluster.length).toBeLessThan(4);
    expect(world.marbles.slice(0, 4).some((marble) => marble.state === "free")).toBe(true);
  });

  it("drops a carried cluster when a player is knocked off the rim", () => {
    const world = startPlaying(false);
    const player = world.players[0];
    stageCarriedMarbles(world, player.id, 3);

    player.isBot = false;
    player.pos = { x: CONFIG.tableRadius - 0.1, z: 0 };
    player.vel = { x: CONFIG.rimEscapeSpeed + 3, z: 0 };

    world.tick(0.04);

    expect(player.y).toBeLessThan(0);
    expect(player.cluster).toHaveLength(0);
    for (const marble of world.marbles.slice(0, 3)) {
      expect(marble.state).toBe("free");
      expect(marble.carrier).toBe(-1);
    }
  });

  it("blocks a target goal when an opponent presses a goal-block button", () => {
    const world = makeWorld("classic", 4, 2468);
    world.startMatch();
    world.round = 2;
    world.startRound();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    const button = world.buttons[0];
    const presser = world.players[1];
    presser.pos = { ...button.pos };
    presser.vel = { x: 0, z: 0 };

    world.tick(0.04);

    expect(world.goals[button.targetGoalOwnerId].blockedUntil).toBeGreaterThan(world.time);
    expect(button.cooldown).toBeGreaterThan(0);
    expect(button.pressedFlash).toBeGreaterThan(0);
  });

  it("pulls free marbles inside auto-goal rings toward the target goal", () => {
    const world = makeWorld("classic", 4, 1357);
    world.startMatch();
    world.round = 3;
    world.startRound();
    world.forceAdvance();
    for (const p of world.players) p.isBot = false;
    for (const marble of world.marbles.slice(1)) marble.state = "dead";
    const ring = world.rings[0];
    const goal = world.goals[ring.targetGoalOwnerId];
    const marble = world.marbles[0];
    marble.state = "free";
    marble.pos = { ...ring.pos };
    marble.vel = { x: 0, z: 0 };
    marble.y = 0;
    const towardGoal = { x: goal.pos.x - marble.pos.x, z: goal.pos.z - marble.pos.z };

    world.tick(0.04);

    expect(marble.vel.x * towardGoal.x + marble.vel.z * towardGoal.z).toBeGreaterThan(0);
  });

  it("serializes obstacle and player state into a NetView-compatible snapshot", () => {
    const world = makeWorld("classic", 4, 9753);
    world.startMatch();
    world.round = 3;
    world.startRound();
    world.forceAdvance();
    stageCarriedMarbles(world, 0, 2);
    world.players[0].heldPowerup = "paint";
    world.players[0].activeUntil.turbo = world.time + 3;
    world.players[0].bankStreak = 2;
    world.players[0].bankStreakUntil = world.time + 4;
    world.tick(0.04);

    const snapshot = buildSnapshot(world, world.drainFx());
    const sent: unknown[] = [];
    const view = new NetView((type, data) => sent.push([type, data]));
    view.applySnapshot(snapshot);

    expect(view.phase).toBe(snapshot.phase);
    expect(view.players).toHaveLength(world.players.length);
    expect(view.players[0].cluster).toHaveLength(snapshot.players[0].cl);
    expect(view.players[0].heldPowerup).toBe("paint");
    expect(view.players[0].activeUntil.turbo).toBeGreaterThan(view.time);
    expect(view.players[0].bankStreak).toBe(2);
    expect(view.players[0].bankStreakUntil).toBeGreaterThan(view.time);
    expect(snapshot.players.slice(1).map((player) => player.bp)).toEqual(["collector", "bruiser", "banker"]);
    expect(view.players[1].botPersonality).toBe("collector");
    expect(view.marbles).toHaveLength(snapshot.marbles.length);
    expect(view.goals).toHaveLength(snapshot.goals.length);
    expect(view.buttons).toHaveLength(snapshot.buttons.length);
    expect(view.rings).toHaveLength(snapshot.rings.length);
    expect(view.rings.map((ring) => ring.targetGoalOwnerId)).toEqual(world.rings.map((ring) => ring.targetGoalOwnerId));
    expect(view.rings.map((ring) => ring.spin)).toEqual(snapshot.rings.map((ring) => ring.sp));

    view.setInput(0, { moveX: 1, moveZ: 0, magnet: true, dash: true, activate: false });
    view.flushInput(1 / 20);
    expect(sent).toHaveLength(1);
  });

  it("sanitizes and snapshots NetView outbound input before clearing one-shot actions", () => {
    const sent: unknown[] = [];
    const view = new NetView((type, data) => sent.push([type, data]));

    view.setInput(0, {
      moveX: Number.NEGATIVE_INFINITY,
      moveZ: 8,
      magnet: true,
      dash: "true" as unknown as boolean,
      activate: true,
    });
    view.flushInput(1 / 20);

    expect(sent).toEqual([[
      "input",
      { moveX: 0, moveZ: 1, magnet: true, dash: false, activate: true },
    ]]);
  });

  it("throttles continuous NetView input while flushing one-shot actions immediately", () => {
    const sent: unknown[] = [];
    const view = new NetView((type, data) => sent.push([type, data]));

    view.setInput(0, { moveX: 0.4, moveZ: -0.3, magnet: true, dash: false, activate: false });
    view.flushInput(1 / 120);

    expect(sent).toHaveLength(0);

    view.flushInput(1 / 120);
    view.flushInput(1 / 120);
    view.flushInput(1 / 120);
    view.flushInput(1 / 120);

    expect(sent).toEqual([["input", { moveX: 0.4, moveZ: -0.3, magnet: true, dash: false, activate: false }]]);

    view.setInput(0, { moveX: 0, moveZ: 0, magnet: false, dash: true, activate: false });
    view.tick(1 / 60);
    view.flushInput(0);

    expect(sent[1]).toEqual(["input", { moveX: 0, moveZ: 0, magnet: false, dash: true, activate: false }]);
  });

  it("does not let a NetView client request authoritative round skips", () => {
    const sent: unknown[] = [];
    const view = new NetView((type, data) => sent.push([type, data]));

    view.forceAdvance();

    expect(sent).toHaveLength(0);
  });

  it("sends bots carrying enough marbles back toward their own goal", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const bot = world.players[1];
    bot.isBot = true;
    stageCarriedMarbles(world, bot.id, BOT_PERSONALITIES.collector.bankWhenCluster);
    bot.pos = { x: 0, z: 0 };
    bot.vel = { x: 0, z: 0 };
    bot.botTimer = 0;
    const toGoal = { x: world.goals[bot.id].pos.x - bot.pos.x, z: world.goals[bot.id].pos.z - bot.pos.z };

    world.tick(0.04);

    expect(bot.botState).toBe("bank");
    expect(bot.wantMagnet).toBe(true);
    expect(bot.moveX * toGoal.x + bot.moveZ * toGoal.z).toBeGreaterThan(0);
  });

  it("uses bot personalities to vary banking risk and pressure", () => {
    const world = startPlaying(false);
    const collector = world.players[1];
    const bruiser = world.players[2];
    const banker = world.players[3];
    const bankerThreshold = BOT_PERSONALITIES.banker.bankWhenCluster;

    stageCarriedMarbles(world, collector.id, bankerThreshold, false, 0);
    stageCarriedMarbles(world, bruiser.id, bankerThreshold, false, 8);
    stageCarriedMarbles(world, banker.id, bankerThreshold, false, 16);
    for (const bot of [collector, bruiser, banker]) {
      bot.pos = { x: 0, z: 0 };
      bot.vel = { x: 0, z: 0 };
      bot.botTimer = 0;
    }

    world.tick(0.04);

    expect([collector.botPersonality, bruiser.botPersonality, banker.botPersonality]).toEqual(["collector", "bruiser", "banker"]);
    expect(collector.botState).not.toBe("bank");
    expect(banker.botState).toBe("bank");
    expect(BOT_PERSONALITIES.bruiser.attackMult).toBeGreaterThan(BOT_PERSONALITIES.collector.attackMult);
  });

  it("uses bot difficulty to tune retarget cadence and movement pressure", () => {
    const easy = makeWorld("classic", 4, 24680, { botDifficulty: "easy" });
    const hard = makeWorld("classic", 4, 24680, { botDifficulty: "hard" });
    easy.startMatch();
    hard.startMatch();
    easy.forceAdvance();
    hard.forceAdvance();

    const easyBot = easy.players[1];
    const hardBot = hard.players[1];
    easyBot.botTimer = 0;
    hardBot.botTimer = 0;
    easyBot.pos = { x: 0, z: 0 };
    hardBot.pos = { x: 0, z: 0 };
    easyBot.vel = { x: 0, z: 0 };
    hardBot.vel = { x: 0, z: 0 };

    easy.tick(0.04);
    hard.tick(0.04);

    expect(easy.botDifficulty).toBe("easy");
    expect(hard.botDifficulty).toBe("hard");
    expect(easyBot.botTimer).toBeGreaterThan(hardBot.botTimer);
    expect(BOT_DIFFICULTIES.easy.speedMult).toBeLessThan(BOT_DIFFICULTIES.hard.speedMult);
  });

  it("respawns inactive powerup pickups without changing their render identity", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const pickup = world.pickups[0];
    const id = pickup.id;
    pickup.active = false;
    pickup.respawnTimer = 0;
    pickup.pos = { x: 999, z: 999 };

    world.tick(0.04);

    expect(pickup.id).toBe(id);
    expect(pickup.active).toBe(true);
    expect(pickup.pos.x).not.toBe(999);
    expect(pickup.pos.z).not.toBe(999);
  });

  it("transfers disable-magnet powerup effects through snapshots and clears them when expired", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;
    const caster = world.players[0];
    caster.heldPowerup = "disableMagnet";
    caster.wantActivate = true;

    world.tick(0.04);

    const activeSnapshot = buildSnapshot(world, world.drainFx());
    const view = new NetView(() => undefined);
    view.applySnapshot(activeSnapshot);

    expect(view.players[0].heldPowerup).toBeNull();
    expect(view.players[0].activeUntil.disableMagnet).toBeUndefined();
    for (const other of view.players.slice(1)) {
      expect(other.activeUntil.disableMagnet).toBeGreaterThan(view.time);
    }

    world.time = Math.max(...world.players.slice(1).map((p) => p.activeUntil.disableMagnet ?? 0)) + 0.1;
    const expiredSnapshot = buildSnapshot(world, []);
    view.applySnapshot(expiredSnapshot);

    for (const p of view.players) {
      expect(p.activeUntil.disableMagnet).toBeUndefined();
    }
  });

  it("progresses through all classic rounds and ends the match with the top scorer", () => {
    const world = startPlaying(false);
    for (const p of world.players) p.isBot = false;

    world.players[0].score = 3;
    world.players[1].score = 1;
    world.roundTime = 0.01;
    world.tick(0.08);
    expect(world.phase).toBe("roundEnd");

    world.forceAdvance();
    expect(world.phase).toBe("intro");
    expect(world.round).toBe(2);
    expect(world.players[0].score).toBe(3);
    expect(world.buttons.length).toBe(world.players.length);

    world.forceAdvance();
    world.players[0].score = 6;
    world.players[1].score = 2;
    world.roundTime = 0.01;
    world.tick(0.08);
    world.forceAdvance();
    expect(world.phase).toBe("intro");
    expect(world.round).toBe(3);
    expect(world.rings.length).toBeGreaterThan(0);

    world.forceAdvance();
    world.players[0].score = 9;
    world.players[1].score = 4;
    world.roundTime = 0.01;
    world.tick(0.08);
    expect(world.phase).toBe("roundEnd");

    world.forceAdvance();
    expect(world.phase).toBe("matchEnd");
    expect(world.winnerId).toBe(0);
  });

  it("keeps all modes internally consistent during seeded mixed-system soak runs", () => {
    for (const mode of MODES) {
      for (const seed of [101, 202]) {
        const world = makeWorld(mode.id, 4, seed, { tutorialAssist: seed === 101 });
        world.startMatch();
        world.forceAdvance();

        for (let i = 0; i < 720; i++) {
          world.tick(1 / 30);
          if (i % 30 === 0) assertWorldIntegrity(world);
          if (world.phase === "matchEnd") break;
          if (world.phase === "roundEnd") world.forceAdvance();
          if (world.phase === "intro") world.forceAdvance();
        }

        assertWorldIntegrity(world);
      }
    }
  });
});
