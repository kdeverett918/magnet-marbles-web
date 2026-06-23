import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const OUTPUT = process.env.AA_READINESS_OUTPUT || "outputs/aa-readiness-smoke.json";

const checks = [];

async function text(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

async function size(path) {
  const info = await stat(path);
  return info.size;
}

async function fileExists(path, minBytes = 1) {
  if (!existsSync(path)) return { pass: false, evidence: `${path} is missing` };
  const bytes = await size(path);
  return {
    pass: bytes >= minBytes,
    evidence: `${path} exists (${bytes} bytes)`,
  };
}

async function walk(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, predicate, out);
    else if (!predicate || predicate(path)) out.push(path);
  }
  return out;
}

function includesEvery(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function ordered(source, first, second) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  return a >= 0 && b >= 0 && a < b;
}

function add(name, pass, evidence, severity = "blocker") {
  checks.push({ name, pass: Boolean(pass), severity, evidence });
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function run() {
  const packageJson = await json("package.json");
  const serverPackageJson = await json("server/package.json");
  const accessibility = await text("src/game/data/accessibility.ts");
  const app = await text("src/App.tsx");
  const main = await text("src/main.tsx");
  const errorBoundary = await text("src/game/ui/ErrorBoundary.tsx");
  const errorBoundaryTest = await text("src/game/ui/ErrorBoundary.test.ts");
  const serviceWorkerRegistration = await text("src/game/serviceWorker.ts");
  const serviceWorker = await text("public/service-worker.js");
  const serviceWorkerSmoke = await text("scripts/service-worker-smoke.mjs");
  const metadataSmoke = await text("scripts/metadata-smoke.mjs");
  const viteConfig = await text("vite.config.ts");
  const config = await text("src/game/data/config.ts");
  const feedback = await text("src/game/data/feedback.ts");
  const identity = await text("src/game/data/identity.ts");
  const world = await text("src/game/sim/world.ts");
  const store = await text("src/game/store.ts");
  const mainMenu = await text("src/game/ui/MainMenu.tsx");
  const hud = await text("src/game/ui/Hud.tsx");
  const hudModel = await text("src/game/ui/hudModel.ts");
  const overlays = await text("src/game/ui/Overlays.tsx");
  const controls = await text("src/game/ui/Controls.tsx");
  const frameIntentTest = await text("src/game/input/frameIntent.test.ts");
  const gameScene = await text("src/game/scene/GameScene.tsx");
  const players = await text("src/game/scene/Players.tsx");
  const pickups = await text("src/game/scene/Pickups.tsx");
  const obstacles = await text("src/game/scene/Obstacles.tsx");
  const sceneBadge = await text("src/game/scene/SceneBadge.tsx");
  const sceneBadgeTexture = await text("src/game/scene/sceneBadgeTexture.ts");
  const affordanceLabels = await text("src/game/scene/affordanceLabels.ts");
  const affordanceLabelsTest = await text("src/game/scene/affordanceLabels.test.ts");
  const marbleMaterial = await text("src/game/scene/marbleMaterial.ts");
  const cameraJuice = await text("src/game/scene/cameraJuice.ts");
  const styles = await text("src/styles.css");
  const sfx = await text("src/game/audio/sfx.ts");
  const noMusic = await text("src/game/audio/noMusic.ts");
  const haptics = await text("src/game/haptics/haptics.ts");
  const progression = await text("src/game/data/progression.ts");
  const noBrowser = await text("scripts/no-browser-check.mjs");
  const sourceFingerprint = await text("scripts/lib/source-fingerprint.cjs");
  const sourceFingerprintSmoke = await text("scripts/source-fingerprint-smoke.mjs");
  const buildInfoSmoke = await text("scripts/build-info-smoke.mjs");
  const launchCheck = await text("scripts/launch-check.mjs");
  const release = await text("scripts/release-readiness.mjs");
  const releaseStatus = await text("scripts/release-status.mjs");
  const liveVersion = await text("scripts/live-version-smoke.mjs");
  const deployMonitor = await text("scripts/deploy-monitor.mjs");
  const onlineSmoke = await text("scripts/online-smoke.mjs");
  const onlineModesSmoke = await text("scripts/online-modes-smoke.mjs");
  const onlineDisconnectSmoke = await text("scripts/online-disconnect-smoke.mjs");
  const cdpBrowser = await text("scripts/lib/cdp-browser.mjs");
  const browserGuard = await text("scripts/browser-guard-smoke.mjs");
  const cleanExit = await text("scripts/clean-exit-smoke.mjs");
  const a11yStatic = await text("scripts/a11y-static-smoke.mjs");
  const mobileLayoutStatic = await text("scripts/mobile-layout-static-smoke.mjs");
  const evidenceTemplate = await text("scripts/evidence-template.mjs");
  const evidenceNegative = await text("scripts/evidence-negative-smoke.mjs");
  const deviceQa = await text("scripts/device-qa-smoke.mjs");
  const hostingConfig = await text("scripts/hosting-config-smoke.mjs");
  const humanReview = await text("scripts/human-review-smoke.mjs");
  const nanoidCompatSmoke = await text("scripts/nanoid-compat-smoke.mjs");
  const assetsSmoke = await text("scripts/assets-smoke.mjs");
  const distBudget = await text("scripts/dist-budget-smoke.mjs");
  const ipSafety = await text("scripts/ip-safety-smoke.mjs");
  const serverIndex = await text("server/src/index.ts");
  const serverBuild = await text("server/scripts/build.mjs");
  const arenaRoom = await text("server/src/ArenaRoom.ts");
  const netView = await text("src/game/net/NetView.ts");
  const verticalSlice = await text("src/game/data/verticalSlice.test.ts");
  const worldTest = await text("src/game/sim/world.test.ts");
  const simSoakTest = await text("src/game/sim/soak.test.ts");
  const simPerformanceTest = await text("src/game/sim/performance.test.ts");
  const hudModelTest = await text("src/game/ui/hudModel.test.ts");
  const progressionTest = await text("src/game/data/progression.test.ts");
  const storeTest = await text("src/game/store.test.ts");
  const settingsMigrationTest = await text("src/game/settingsMigration.test.ts");
  const identityTest = await text("src/game/data/identity.test.ts");
  const accessibilityTest = await text("src/game/data/accessibility.test.ts");
  const readinessDoc = await text("docs/WEB_LAUNCH_READINESS.md");
  const deviceQaChecklist = await text("docs/DEVICE_QA_CHECKLIST.md");
  const humanReviewChecklist = await text("docs/HUMAN_AA_REVIEW_CHECKLIST.md");
  const assetBudget = await text("docs/ASSET_BUDGET.md");
  const privacyPage = await text("public/privacy.html");
  const supportPage = await text("public/support.html");
  const renderYaml = await text("render.yaml");
  const ciWorkflow = await text(".github/workflows/ci.yml");
  const deployMonitorWorkflow = await text(".github/workflows/deploy-monitor.yml");

  const scripts = packageJson.scripts ?? {};
  add("stack:react-r3f-browser-game", includesEvery(JSON.stringify(packageJson.dependencies ?? {}), [
    "@react-three/fiber",
    "three",
    "zustand",
    "colyseus.js",
  ]), "React, R3F, three, zustand, and Colyseus client dependencies are present");

  add("architecture:sim-render-ui-split", [
    "src/game/sim/world.ts",
    "src/game/scene/GameScene.tsx",
    "src/game/ui/MainMenu.tsx",
    "src/game/ui/Hud.tsx",
    "src/game/input/controls.ts",
    "src/game/audio/sfx.ts",
    "src/game/haptics/haptics.ts",
  ].every(existsSync), "Simulation, scene, UI, input, and audio modules exist as separate surfaces");

  const expectedModes = ["classic", "battle", "king-magnet", "team-bank", "survival"];
  add("gameplay:requested-five-mode-lineup", expectedModes.every((id) => config.includes(`id: "${id}"`)), `Config includes ${expectedModes.join(", ")}`);
  add("gameplay:phone-round-lengths", countMatches(config, /duration:\s*90/g) >= expectedModes.length, "Every launch mode is configured around 90-second rounds");
  add("gameplay:four-player-bot-vertical-slice", includesEvery(verticalSlice, [
    "one-human, three-bot",
    "players.filter((player) => !player.isBot)",
    "players.filter((player) => player.isBot)",
  ]), "Vertical-slice test locks one human plus three bot opponents");
  add("gameplay:three-bot-difficulty-levels", includesEvery(config, [
    "BOT_DIFFICULTIES",
    "easy",
    "normal",
    "hard",
    "skillMult",
    "attackMult",
    "retargetMult",
    "speedMult",
  ]) && includesEvery(world, [
    "botDifficulty",
    "BOT_DIFFICULTIES[this.botDifficulty]",
    "difficulty.retargetMult",
    "difficulty.attackMult",
  ]) && includesEvery(mainMenu, [
    "BOT_DIFFICULTIES",
    "setBotDifficulty",
    "Bot difficulty",
  ]) && includesEvery(overlays, [
    "BOT_DIFFICULTIES",
    "setBotDifficulty",
    "bots next match",
  ]) && includesEvery(store, [
    "botDifficulty",
    "setBotDifficulty",
    "makeWorld(modeId, playerCount",
    "makeWorld(daily.modeId",
  ]) && includesEvery(verticalSlice, [
    "exposes three bot difficulty levels",
    "easy",
    "normal",
    "hard",
  ]) && includesEvery(worldTest, [
    "uses bot difficulty to tune retarget cadence",
    "botDifficulty: \"easy\"",
    "botDifficulty: \"hard\"",
  ]) && includesEvery(storeTest, [
    "passes selected bot difficulty",
    "setBotDifficulty(\"hard\")",
    "botDifficulty: \"easy\"",
  ]), "Solo play exposes Easy, Normal, and Hard bot difficulty with simulation and store coverage");
  add("gameplay:readable-bot-personalities", includesEvery(config, [
    "BOT_PERSONALITIES",
    "collector",
    "bruiser",
    "banker",
    "bankWhenCluster",
    "jumboBias",
  ]) && includesEvery(world, [
    "BOT_PERSONALITY_ORDER",
    "botPersonalityForSlot",
    "BOT_PERSONALITIES[p.botPersonality]",
    "personality.bankWhenCluster",
    "personality.attackMult",
    "personality.dashChance",
    "nearestFreeMarble(p.pos, personality.jumboBias)",
  ]) && includesEvery(mainMenu, [
    "BOT_PERSONALITIES",
    "bot-roster",
    "Bot roles",
  ]) && includesEvery(hud, [
    "BOT_PERSONALITIES",
    "bot-role",
  ]) && includesEvery(overlays, [
    "standing-role",
  ]) && includesEvery(netView, [
    "botPersonality = sp.bp",
  ]) && includesEvery(verticalSlice, [
    "distinct readable play styles",
    "collector",
    "bruiser",
    "banker",
  ]) && includesEvery(worldTest, [
    "uses bot personalities to vary banking risk",
    "snapshot.players.slice(1).map((player) => player.bp)",
  ]) && includesEvery(styles, [
    ".bot-roster",
    ".bot-role",
    ".standing-role",
  ]), "Solo opponents have distinct Collector/Bruiser/Banker behavior, UI tags, snapshot propagation, and regression coverage");
  add("gameplay:my-street-core-loop", includesEvery(verticalSlice, [
    "proves the playable My Street-style core loop",
    "magnet: true",
    "toBe(\"carried\")",
    "toBeGreaterThan(firstScore)",
    "botState",
    "matchEnd",
    "rematch",
  ]), "Vertical-slice test proves move, magnet, carry, bank, bots, match end, and rematch");

  add("stability:no-browser-sim-soak-gate", scripts["sim:soak"] === "vitest run src/game/sim/soak.test.ts"
    && includesEvery(noBrowser, [
      "web:sim-soak",
      "SIM_SOAK_OUTPUT",
      "sim:soak",
    ])
    && includesEvery(simSoakTest, [
      "Long deterministic simulation soak",
      "SOAK_SECONDS = 180",
      "SEEDS",
      "SIM_SOAK_OUTPUT",
      "browserAutomation: false",
      "totalSimSeconds",
      "duplicate carried marble",
    ]),
  "The safe no-browser gate runs the long all-mode deterministic soak and writes structured stability evidence");

  add("stability:root-error-recovery", includesEvery(main, [
    "ErrorBoundary",
    "<ErrorBoundary>",
  ]) && includesEvery(errorBoundary, [
    "supportCodeForError",
    "clearCrashRecoveryStorage",
    "role=\"alert\"",
    "Reset local data",
    "SETTINGS_KEY",
    "PROGRESSION_KEY",
    "TUTORIAL_KEY",
  ]) && includesEvery(errorBoundaryTest, [
    "creates stable support codes",
    "clears only Magnet Marbles local recovery keys",
    "keeps recovery available when storage throws",
  ]) && includesEvery(supportPage, [
    "Crash Recovery",
    "Table reset needed",
    "crash support code",
    "MM-",
    "Reset local data button only clears Magnet Marbles",
  ]) && includesEvery(metadataSmoke, [
    "Table reset needed",
    "crash support code",
    "MM-",
  ]) && includesEvery(styles, [
    ".crash-screen",
    ".crash-card",
    ".crash-code",
  ]), "Root React crash boundary shows a branded recovery screen, stable support code, local-only reset path, and public support intake instead of a blank canvas");

  add("performance:no-browser-sim-budget", scripts["sim:perf"] === "vitest run src/game/sim/performance.test.ts"
    && includesEvery(noBrowser, [
      "web:sim-performance",
      "SIM_PERFORMANCE_OUTPUT",
      "sim:perf",
    ])
    && includesEvery(simPerformanceTest, [
      "No-browser simulation performance budget",
      "MIN_REALTIME_MULT",
      "SIM_PERFORMANCE_OUTPUT",
      "browserAutomation: false",
      "realtimeMultiplier",
      "totalFxEvents",
    ]),
  "No-browser validation records and enforces a deterministic all-mode simulation throughput budget");

  add("gameplay:magnet-carry-combat-tuning", includesEvery(config, [
    "clusterCap: 18",
    "speedPenaltyPerMarble",
    "minSpeedMultiplier",
    "stealFraction",
    "shockPulseDropFraction",
    "heavyCoreMassMult",
    "bankWhenCluster",
    "scoreEvery: 2",
    "streakWindow",
    "streakMax",
  ]) && includesEvery(worldTest, [
    "slightly slows full carried hauls",
    "fullHaulSpeed",
  ]), "Magnet carry cap, haul-weight speed risk, steal, shock pulse, heavy core, bot banking, and King Magnet scoring tunables are present");
  add("gameplay:quick-bank-streak-mastery", includesEvery(world, [
    "ensureBankRun",
    "bankStreakBonus",
    "bankStreakUntil",
    "bankStreak",
  ]) && includesEvery(feedback, [
    "bankStreak",
    "Quick return",
  ]) && includesEvery(hud, [
    "bank-streak",
    "Bank streak",
  ]) && includesEvery(verticalSlice, [
    "streakWindow",
    "streakMax",
  ]) && includesEvery(worldTest, [
    "rewards fast repeat bank runs",
    "bankStreak",
    "bonus: 1",
  ]),
  "Fast repeat banking has short-lived bonus scoring, HUD/feedback surfacing, and sim coverage");
  add("gameplay:launch-powerup-trio", includesEvery(verticalSlice, [
    "MVP_POWERUPS",
    "magnetBurst",
    "shockPulse",
    "heavyCore",
    "CORE_POWERUPS",
  ]) && includesEvery(config, [
    "CORE_POWERUPS",
    "Magnet Burst",
    "Shock Pulse",
    "Heavy Core",
  ]), "Launch pool is locked to Magnet Burst, Shock Pulse, and Heavy Core");
  add("gameplay:later-round-powerup-depth", includesEvery(config, [
    "ADVANCED_POWERUPS",
    "MID_MATCH_POWERUPS",
    "ALL_GAMEPLAY_POWERUPS",
    "superMagnet",
    "doubleScore",
    "plusFive",
    "turbo",
    "disableMagnet",
    "paint",
  ]) && includesEvery(world, [
    "powerupPoolForRound",
    "this.round <= 1",
    "MID_MATCH_POWERUPS",
    "ALL_GAMEPLAY_POWERUPS",
  ]) && includesEvery(verticalSlice, [
    "ramps advanced powerups after the first clean round",
    "ADVANCED_POWERUPS",
    "ALL_GAMEPLAY_POWERUPS",
  ]) && includesEvery(worldTest, [
    "ramps richer powerup pools in later rounds",
    "MID_MATCH_POWERUPS",
    "ALL_GAMEPLAY_POWERUPS",
  ]),
  "Later rounds add Super Magnet, Double Score, Plus Five, Turbo, Jam, and Paint depth while round one stays readable");

  add("content:progression-loop", includesEvery(progression, [
    "TRAIL_COSMETICS",
    "dailyChallengeFor",
    "DEFAULT_PROGRESSION",
    "stars",
    "selectedTrail",
    "skinColor",
    "skinAccent",
    "finish",
  ]) && includesEvery(mainMenu, [
    "Daily challenge",
    "TRAIL_COSMETICS",
    "Marble skin and trail cosmetics",
    "skin-swatch",
    "--accent-skin",
    "unlockTrail",
    "selectTrail",
  ]) && includesEvery(players, [
    "getTrailCosmetic(selectedTrail)",
    "cosmetic?.skinColor",
    "cosmetic?.skinAccent",
    "makeMarbleMaterial(visualColor, skinAccent)",
  ]) && includesEvery(marbleMaterial, [
    "accentHex",
    "uAccent",
  ]), "Stars, daily challenge, six marble skin/trail cosmetics, unlock, equip, and in-game shooter skin rendering are wired");

  add("content:next-unlock-progression-target", includesEvery(progression, [
    "export function nextUnlockFor",
    "starsNeeded",
    "ready",
    "TRAIL_COSMETICS",
  ]) && includesEvery(progressionTest, [
    "summarizes the next cosmetic unlock target",
    "Candy Rift",
    "Gold Rush",
    "toBeNull",
  ]) && includesEvery(mainMenu, [
    "nextUnlockFor",
    "next-unlock",
    "Next unlock",
    "unlockTrail(nextUnlock.trail.id)",
  ]) && includesEvery(overlays, [
    "nextUnlockFor",
    "next-reward-target",
    "unlock-reward-button",
    "Unlock & Equip",
    "unlockTrail(nextUnlock.trail.id)",
    "Next unlock:",
    "Cosmetic ready now",
  ]) && includesEvery(storeTest, [
    "unlocks and equips a ready cosmetic reward from stored stars",
    "selectedTrail: \"candy\"",
  ]) && includesEvery(styles, [
    ".next-unlock",
    ".next-unlock.ready",
    ".next-reward-target",
    ".unlock-reward-button",
    "@media (max-width: 640px)",
  ]), "Progression shows a tested next cosmetic goal in the menu and post-match reward flow");

  add("content:daily-streak-retention", includesEvery(progression, [
    "dailyStreak: DailyStreak",
    "export function dailyStreakFor",
    "applyDailyStreak",
    "lastCompleted",
  ]) && includesEvery(progressionTest, [
    "tracks daily challenge streaks by UTC daily id",
    "dailyStreakFor",
    "current: 2",
    "best: 2",
  ]) && includesEvery(store, [
    "dailyStreak: Pick<DailyStreak",
    "reward.dailyCompleted",
    "progression.dailyStreak.current",
  ]) && includesEvery(storeTest, [
    "exposes daily streak progress when a daily match reward is claimed",
    "dailyCompleted: true",
    "dailyStreak: { current: 1, best: 1 }",
  ]) && includesEvery(mainMenu, [
    "dailyStreakFor",
    "day streak",
    "d streak",
  ]) && includesEvery(overlays, [
    "daily-streak-target",
    "Daily streak:",
  ]) && includesEvery(styles, [
    ".daily-streak-target",
  ]), "Daily challenges carry a tested local streak loop into menu and result reward surfaces");

  add("content:local-mode-records", includesEvery(progression, [
    "records: ModeRecords",
    "export function modeRecordFor",
    "export function recordMatch",
    "isNewBest",
  ]) && includesEvery(progressionTest, [
    "tracks sanitized local records per mode",
    "modeRecordFor",
    "recordMatch",
    "isNewBest",
  ]) && includesEvery(store, [
    "recordMatch(withReward",
    "previousBest",
    "lastReward",
    "matches",
  ]) && includesEvery(storeTest, [
    "records local mode bests without double-counting the same match reward",
    "PROGRESSION_KEY",
    "records.classic",
  ]) && includesEvery(mainMenu, [
    "modeRecordFor",
    "record-strip",
    "selectedRecord.bestScore",
    "selectedRecord.matches",
  ]) && includesEvery(overlays, [
    "record-reward-target",
    "New ${hud.modeName} best",
    "wins /",
  ]) && includesEvery(styles, [
    ".record-strip",
    ".record-reward-target",
    ".record-reward-target.new-best",
  ]), "Offline results persist local mode bests, wins, and matches with menu and reward-surface coverage");

  add("ui:premium-phone-menu", includesEvery(mainMenu, [
    "MenuBackground",
    "SINGLE PLAYER",
    "PLAY ONLINE",
    "mode-showcase",
    "power-strip",
    "power-strip-stage",
    "CORE_POWERUPS",
    "ADVANCED_POWERUPS",
    "Later rounds",
    "progression-strip",
    "Privacy",
    "Support",
  ]) && includesEvery(styles, [
    ".menu-scrim",
    ".menu-stage",
    ".power-strip-stage",
    ".power-chip-row",
    "@media (max-width: 640px)",
  ]), "Menu has a themed 3D background, first-screen play actions, mode showcase, visible powerup ramp, progression, and mobile CSS");

  add("ui:low-chrome-game-hud", includesEvery(hud, [
    "objective-chip",
    "scoreboard",
    "timer-wrap",
    "humanHudPlayer",
    "cluster",
    "feedback-toast",
    "Quit to menu",
  ]) && includesEvery(styles, [
    "env(safe-area-inset-top)",
    "env(safe-area-inset-bottom)",
    ".objective-chip",
    ".feedback-toast",
  ]), "HUD keeps objective, scores, timer, carried count, safe areas, and actual human-seat selection");

  add("ui:no-browser-mobile-layout-contract", scripts["mobile:layout"] === "node scripts/mobile-layout-static-smoke.mjs"
    && noBrowser.includes("web:mobile-layout-static-smoke")
    && noBrowser.includes("MOBILE_LAYOUT_STATIC_OUTPUT")
    && releaseStatus.includes("web:mobile-layout-static-smoke")
    && sourceFingerprintSmoke.includes("scripts/mobile-layout-static-smoke.mjs")
    && includesEvery(mobileLayoutStatic, [
      "browserAutomation: false",
      "viewport:safe-area-and-touch-root",
      "menu:phone-first-launch-surface",
      "hud:phone-safe-nonoverlap-contract",
      "controls:two-thumb-magnet-dash-model",
      "targets:thumb-sized-primary-actions",
      "release:physical-phone-review-still-required",
      "right-gesture-zone",
      "env(safe-area-inset-bottom)",
      "390x844",
      "DEVICE_QA_CHECKLIST.md",
    ])
    && includesEvery(readinessDoc, [
      "physical-phone install/offline review",
      "glare, OLED contrast, and notch/safe-area variance",
    ]),
  "Safe validation includes a no-browser mobile layout/touch contract while preserving physical-phone review as the launch authority");

  add("ui:carry-risk-advice", includesEvery(hud, [
    "carryAdviceFor",
    "carry-advice",
    "Carry advice",
    "aria-valuetext",
  ]) && includesEvery(hudModel, [
    "export function carryAdviceFor",
    "export function stealTargetFor",
    "Sweet spot",
    "High risk",
    "Bank now",
    "Streak haul",
    "King size",
    "Loaded",
    "Steal target",
  ]) && includesEvery(hudModelTest, [
    "compact risk and banking advice",
    "timer, full cluster, and streak pressure",
    "mode-aware without adding overlay clutter",
    "surfaces loaded rivals as steal targets",
    "does not target teammates",
  ]) && includesEvery(styles, [
    ".carry-advice",
    ".carry-advice.bank",
    ".carry-advice.risk",
    ".carry-advice.urgent",
    ".carry-advice.target",
    "@media (max-width: 640px)",
  ]), "Carried-marble meter now gives compact mode-aware bank/risk/streak/steal-target advice with accessibility coverage");

  add("ui:competitive-race-status", includesEvery(hud, [
    "raceStatusFor",
    "race-chip",
    "Race status",
  ]) && includesEvery(hudModel, [
    "rankPlayersForResults",
    "resultScoreForPlayer",
    "team-bank",
    "survival",
    "Chase",
  ]) && includesEvery(hudModelTest, [
    "Classic chase and lead pressure",
    "team language",
    "lives-first language",
    "does not show race status during countdown",
  ]) && includesEvery(styles, [
    ".race-chip",
    ".race-chip.lead",
    ".race-chip.chase",
    ".race-chip.danger",
    "@media (max-width: 640px)",
  ]), "Live HUD includes a compact mode-aware race status chip so players can read lead/chase/tie pressure without opening a scoreboard");

  add("ui:rim-danger-readability", includesEvery(hud, [
    "rimDangerFor",
    "rim-warning",
    "Rim danger",
  ]) && includesEvery(hudModel, [
    "export function rimDangerFor",
    "Rim danger",
    "Sliding wide",
    "Loaded near rim",
    "Final-life edge",
  ]) && includesEvery(hudModelTest, [
    "warns about rim risk before a knockoff becomes hard to read",
    "Brake before lip",
    "Pulse defensively",
  ]) && includesEvery(styles, [
    ".rim-warning",
    ".rim-warning.danger",
    "@media (max-width: 640px)",
  ]), "HUD warns when the human marble is fast, loaded, or final-life near the rim so knockoff danger stays readable on phones");

  add("ui:right-thumb-action-readability", includesEvery(controls, [
    "actionStatusFor",
    "action-status",
    "action-pill",
    "Use ${heldMeta.label}: ${heldMeta.desc}",
    "Dash cooling down ${dashCooldownLabel} seconds",
    "Magnet pulling",
  ]) && includesEvery(hudModel, [
    "export function actionStatusFor",
    "POWERUP_META[hud.heldPowerup].short",
    "cooldownSeconds",
  ]) && includesEvery(hudModelTest, [
    "turns right-thumb actions into compact readable phone states",
    "magnetBurst",
    "dashCooldown: 1.2",
    "Pulling",
  ]) && includesEvery(styles, [
    ".action-status",
    ".action-pill",
    ".action-pill.cooldown",
    ".act .act-label",
  ]), "Right-thumb powerup, dash cooldown, and magnet states are visible, compact, accessible, and model-tested for phone play");

  add("ui:first-round-coach-strip", includesEvery(hud, [
    "tutorialCoachStepsFor",
    "coach-steps",
    "coach-step",
    "First round coach",
    "tutorial-coach",
  ]) && includesEvery(hudModelTest, [
    "compact first-round coach",
    "[\"Pull\", \"active\"]",
    "[\"Bank\", \"active\"]",
  ]) && includesEvery(styles, [
    ".coach-steps",
    ".coach-step.active",
    ".hud.tutorial-coach .buffs",
  ]), "First-time players get a low-chrome Pull/Carry/Bank coach strip that is model-tested and overlap-aware");

  add("ui:intro-mode-briefing", includesEvery(overlays, [
    "introBriefFor",
    "intro-brief",
    "intro-steps",
    "Round plan",
  ]) && includesEvery(hud, [
    "objectiveFor",
  ]) && includesEvery(hudModelTest, [
    "compact intro briefings",
    "distinct pre-round plan",
    "P3 Classic",
    "90-second sprint",
  ]) && includesEvery(styles, [
    ".intro-brief",
    ".intro-steps",
    "--player-color",
    "@media (max-width: 640px)",
  ]), "Intro countdown has a compact mode-specific briefing with player identity and mobile-safe styling");

  add("ui:mode-aware-results-recap", includesEvery(overlays, [
    "resultRecapFor",
    "masteryBadgeFor",
    "result-recap",
    "mastery-badge",
    "aria-label={`${recap.eyebrow}:",
  ]) && includesEvery(hudModel, [
    "ResultRecap",
    "MasteryBadge",
    "New personal best",
    "Rival smasher",
    "Table survivor",
    "modeTipFor",
    "Match recap",
    "Round recap",
    "team-bank",
    "survival",
  ]) && includesEvery(hudModelTest, [
    "Classic result recap",
    "winning round recap",
    "Team Bank result recap",
    "Survival elimination",
    "result mastery badge",
    "mode-specific mastery badges",
    "close losses a compact next-run mastery target",
    "does not build result recap outside results phases",
  ]) && includesEvery(styles, [
    ".result-recap",
    ".mastery-badge",
    ".mastery-badge.record",
    ".mastery-badge.bank",
    ".mastery-badge.combat",
    ".mastery-badge.survive",
    ".result-recap.win",
    ".result-recap.close",
    ".result-recap.learn",
    "@media (max-width: 640px)",
  ]), "Results overlay includes a compact mode-aware recap and next-run tip so players understand why they won/lost without reading a full scoreboard");

  add("ui:moment-to-moment-feedback", includesEvery(feedback, [
    "feedbackForEvents",
    "Haul growing",
    "Cluster full",
    "Huge bank",
    "Bank streak",
    "Steal",
    "Rim out",
    "Shock pulse",
  ]) && includesEvery(config, [
    "clusterMilestones",
  ]) && includesEvery(world, [
    "kind: \"cluster\"",
  ]) && includesEvery(sfx, [
    "case \"cluster\"",
  ]) && includesEvery(gameScene, [
    "feedbackForEvents(fx)",
    "pushFeedback",
  ]) && includesEvery(hud, [
    "clearFeedback",
    "aria-live=\"polite\"",
  ]), "Cluster milestones, major banks, steals, knockoffs, and powerups create low-chrome transient HUD callouts");

  add("ui:solo-pause-and-lifecycle-safety", includesEvery(store, [
    "paused: boolean",
    "setPaused",
    "togglePaused",
    "if (s.online || s.screen !== \"game\")",
  ]) && includesEvery(app, [
    "visibilitychange",
    "Escape",
    "resetInput",
    "setPaused(true)",
  ]) && includesEvery(gameScene, [
    "if (paused)",
    "clearEdges()",
  ]) && includesEvery(overlays, [
    "pause-card",
    "role=\"dialog\"",
    "aria-modal=\"true\"",
    "pauseResumeRef",
    "document.activeElement",
    "focus({ preventScroll: true })",
    "aria-label=\"Resume game\"",
    "Resume",
    "Restart",
    "Haptics",
  ]) && includesEvery(hud, [
    "Pause game",
    "togglePaused",
  ]) && includesEvery(styles, [
    ".pause-card",
    ".pause-actions",
  ]) && includesEvery(storeTest, [
    "pauses and resumes local solo matches",
    "does not pause online matches",
  ]), "Solo play has a pause/options surface, Escape/visibility pause safety, input clearing, and online pause guard");

  add("accessibility:color-assist-identities", includesEvery(identity, [
    "playerMarker",
    "goalMarker",
    "identityPipCount",
    "P${id + 1}",
  ]) && includesEvery(store, [
    "colorAssist",
    "toggleColorAssist",
  ]) && includesEvery(mainMenu, [
    "toggleColorAssist",
    "Color Assist",
  ]) && includesEvery(overlays, [
    "toggleColorAssist",
    "standing-marker",
    "Color Assist",
  ]) && includesEvery(hud, [
    "playerMarker",
    "score-pill",
    "aria-label",
    "colorAssist",
  ]) && includesEvery(players, [
    "IdentityPipBadge",
    "identityPipCount",
    "colorAssist",
  ]) && includesEvery(await text("src/game/scene/Goals.tsx"), [
    "IdentityPipBadge",
    "identityPipCount",
    "colorAssist",
  ]) && includesEvery(styles, [
    ".score-pill.assist",
    ".standing-marker",
  ]) && includesEvery(storeTest, [
    "persists the Color Assist readability setting",
  ]) && includesEvery(identityTest, [
    "color-independent player marker",
    "team-bank goals",
    "mesh pips",
  ]), "Color Assist adds persisted non-color identity markers to HUD, results, players, and goals with regression coverage");

  add("accessibility:player-motion-control", includesEvery(accessibility, [
    "MotionMode",
    "MOTION_MODES",
    "resolveReducedMotion",
    "reduced",
    "full",
  ]) && includesEvery(await text("src/game/ui/useReducedMotion.ts"), [
    "resolveReducedMotion",
    "settings.motion",
    "prefers-reduced-motion",
  ]) && includesEvery(store, [
    "motion",
    "setMotion",
    "isMotionMode",
  ]) && includesEvery(mainMenu, [
    "MOTION_MODES",
    "setMotion",
    "Motion amount",
  ]) && includesEvery(overlays, [
    "MOTION_MODES",
    "setMotion",
    "Motion amount",
  ]) && includesEvery(gameScene, [
    "if (!reducedMotion) addCameraImpulse",
    "!reducedMotion && !mobileViewport",
  ]) && includesEvery(styles, [
    ".segmented",
    ".mini-chip",
  ]) && includesEvery(storeTest, [
    "persists the motion accessibility setting",
    "setMotion(\"reduced\")",
  ]) && includesEvery(accessibilityTest, [
    "resolves motion preference",
    "isMotionMode",
  ]), "Players can persist Auto/Reduced/Full motion, overriding or following OS reduced-motion preference through menu and pause controls");

  add("accessibility:hud-objective-and-carry-meter", includesEvery(hud, [
    "hud-objective-status",
    "objectiveAnnouncementFor",
    "aria-describedby=\"hud-objective-status\"",
    "role=\"status\"",
    "aria-live=\"polite\"",
    "aria-atomic=\"true\"",
    "role=\"meter\"",
    "aria-label=\"Carried marbles\"",
    "aria-valuenow",
    "aria-valuetext",
  ]) && includesEvery(hudModelTest, [
    "screen-reader objective announcements",
  ]), "HUD objective changes are announced politely and carried marbles expose meter semantics without adding visual chrome");

  add("accessibility:no-browser-static-contract", scripts["a11y:static"] === "node scripts/a11y-static-smoke.mjs"
    && noBrowser.includes("web:a11y-static-smoke")
    && noBrowser.includes("A11Y_STATIC_OUTPUT")
    && includesEvery(a11yStatic, [
      "browserAutomation: false",
      "menu:screen-reader-input-guidance",
      "hud:polite-status-and-meter-semantics",
      "controls:touch-actions-accessible",
      "overlays:pause-results-focus-and-labels",
      "css:focus-safe-area-reduced-motion",
      "settings:accessibility-comfort-options",
      "tests:screen-reader-model-coverage",
      "release:manual-a11y-evidence-required",
      "automation:browser-a11y-remains-opt-in",
      "screen-reader-focus",
      "accessibility-comfort",
    ]),
  "Safe validation includes a no-browser accessibility contract for screen-reader copy, focus, ARIA status/meter semantics, touch controls, reduced motion, and manual evidence requirements");

  add("input:phone-touch-model", includesEvery(controls, [
    "lower-right",
    "hold magnet",
    "tap / flick dash",
    "rightGestureShouldDash",
    "setTouchMagnetHeld",
  ]) && includesEvery(gameScene, [
    "humanFrameIntent(input)",
    "magnet: intent.magnet",
  ]) && includesEvery(await text("src/game/input/controls.test.ts"), [
    "tracks direct-drag targets",
    "expect(input.dash).toBe(false)",
  ]) && includesEvery(frameIntentTest, [
    "does not turn movement into magnet input",
    "magnet: false",
    "preserves explicit magnet",
  ]) && includesEvery(worldTest, [
    "dashes from neutral using the last movement direction",
    "does not spend dash cooldown when no direction has ever been given",
  ]), "Touch model matches drag-to-move plus lower-right hold/tap dash regression coverage");

  const expectedSfx = ["pickup", "bank", "hit", "shock-pulse", "magnet-burst", "fall"];
  const sfxFiles = await Promise.all(expectedSfx.map((name) => fileExists(`public/audio/sfx/${name}.mp3`, 4_000)));
  const musicFilePattern = /[\\/]audio[\\/]music\.(mp3|wav|ogg|m4a|aac|flac)$/i;
  const publicMusicFiles = await walk("public/audio", (path) => musicFilePattern.test(path));
  const distMusicFilesForAudio = await walk("dist/audio", (path) => musicFilePattern.test(path));
  add("audio:six-shipped-sfx", sfxFiles.every((item) => item.pass), sfxFiles.map((item) => item.evidence).join("; "));
  add("audio:sfx-only-no-music", publicMusicFiles.length === 0
    && distMusicFilesForAudio.length === 0
    && !sfx.includes("music(")
    && !sfx.includes("music.mp3")
    && assetsSmoke.includes("assertNoMusicFiles")
    && distBudget.includes("background music is disabled"),
  `Background music runtime is disabled and audio/music.* is absent from public/dist (${publicMusicFiles.length}/${distMusicFilesForAudio.length})`);
  add("audio:removed-music-runtime-guard", includesEvery(app, [
    "installNoMusicGuard",
  ]) && includesEvery(noMusic, [
    "installRemovedMusicPlayBlocker",
    "HTMLMediaElement.prototype.play",
    "stopRemovedMusicElements",
    "purgeRemovedMusicCaches",
    "audio\\/music\\.",
    "mp3|wav|ogg|m4a|aac|flac",
  ]),
  "App boot blocks stale audio/music.* playback, removes matching DOM elements, and purges old cached background music variants");
  add("audio:player-sfx-volume-control", includesEvery(sfx, [
    "setVolume",
    "applyMasterGain",
    "this.volume",
  ]) && includesEvery(store, [
    "sfxVolume",
    "setSfxVolume",
    "clamp01",
    "SETTINGS_AUDIO_TUNING_VERSION",
    "migrateSfxVolume",
    "audioTuningVersion",
  ]) && includesEvery(app, [
    "sfxVolume",
    "sfx.setVolume",
  ]) && includesEvery(mainMenu, [
    "setSfxVolume",
    "volume-control",
  ]) && includesEvery(overlays, [
    "setSfxVolume",
    "pause-volume",
  ]) && includesEvery(storeTest, [
    "clamps and persists the SFX volume setting",
    "Number.NaN",
  ]) && includesEvery(settingsMigrationTest, [
    "caps legacy saved SFX volumes to the quieter launch baseline",
    "preserves current-version volume choices after migration",
    "sfxVolume: 0.65",
    "sfxVolume: 0.28",
    "audioTuningVersion: 2",
  ]),
  "SFX volume is persisted, migrated away from old loud saved values, clamped, applied to the WebAudio master gain, and exposed in menu plus pause options");

  add("audio:sfx-preview-control", includesEvery(sfx, [
    "preview()",
    "this.ensure()",
    "this.sample(\"pickup\"",
    "this.sample(\"bank\"",
  ]) && includesEvery(mainMenu, [
    "previewSfx",
    "sfx.preview()",
    "Test SFX",
    "Play a short sound effect at the current SFX volume",
  ]) && includesEvery(overlays, [
    "previewSfx",
    "sfx.preview()",
    "Test SFX",
    "Play a short sound effect at the current SFX volume",
  ]) && includesEvery(styles, [
    ".test-sfx-chip",
    ".test-sfx-chip:hover:not(:disabled)",
  ]) && includesEvery(supportPage, [
    "Test SFX",
  ]) && includesEvery(metadataSmoke, [
    "Test SFX",
  ]),
  "Players can audition a short SFX sample from menu and pause options at the current volume without reintroducing background music");

  add("mobile:haptics-feedback", includesEvery(haptics, [
    "navigator.vibrate",
    "hapticPatternForEvent",
    "HAPTIC_PREVIEW_PATTERN",
    "pickup",
    "bank",
    "steal",
    "fall",
  ]) && includesEvery(mainMenu, [
    "toggleHaptics",
    "settings.haptics",
    "Haptics",
  ]) && includesEvery(controls, [
    "haptics.tap(\"magnet\")",
    "haptics.tap(\"dash\")",
  ]) && gameScene.includes("haptics.play(ev)"),
  "Phone haptics are configurable and wired to touch controls plus gameplay pickup/bank/hit/steal/fall/powerup feedback");

  add("mobile:haptics-preview-control", includesEvery(haptics, [
    "HAPTIC_PREVIEW_PATTERN",
    "preview()",
    "this.pulse(HAPTIC_PREVIEW_PATTERN",
  ]) && includesEvery(await text("src/game/haptics/haptics.test.ts"), [
    "provides a distinct phone-safe haptic preview pattern",
  ]) && includesEvery(mainMenu, [
    "previewHaptics",
    "haptics.preview()",
    "Test Haptics",
    "Play a short phone vibration preview",
  ]) && includesEvery(overlays, [
    "previewHaptics",
    "haptics.preview()",
    "Test Haptics",
    "Play a short phone vibration preview",
  ]) && includesEvery(styles, [
    ".test-haptics-chip",
    ".test-haptics-chip:hover:not(:disabled)",
  ]) && includesEvery(supportPage, [
    "Test Haptics",
  ]) && includesEvery(metadataSmoke, [
    "Test Haptics",
  ]),
  "Players can test supported phone vibration from menu and pause options before committing to haptics in play");

  add("mobile:pwa-app-shell-resilience", includesEvery(main, [
    "registerServiceWorker",
  ]) && includesEvery(serviceWorkerRegistration, [
    "isLocalDevelopmentHost",
    "window.location.hostname",
    "new URL(\"service-worker.js\", window.location.href)",
    "serviceWorker",
    "registration.update",
  ]) && includesEvery(serviceWorker, [
    "CACHE_PREFIX",
    "APP_SHELL",
    "isRemovedAudioPath",
    "music\\.",
    "purgeRemovedAssets",
    "removedAudioResponse",
    "status: 410",
    "./build.json",
    "networkFirst",
    "cacheFirst",
    "sameOrigin(request)",
    "clients.claim",
  ]) && includesEvery(metadataSmoke, [
    "service-worker.js",
    "networkFirst",
    "cacheFirst",
  ]),
  "PWA service worker skips local development hosts, caches the app shell/SFX, purges removed music, keeps build metadata network-first, and is enforced by metadata smoke");
  add("mobile:pwa-app-shell-behavior-smoke", scripts["sw:smoke"] === "node scripts/service-worker-smoke.mjs"
    && noBrowser.includes("web:service-worker-smoke")
    && includesEvery(serviceWorkerSmoke, [
      "vm.runInContext",
      "FakeCaches",
      "dispatchLifecycle",
      "dispatchFetch",
      "removed music should return 410",
      "removed music variants should return 410",
      "build.json should use network-first response",
      "index.html fallback should use precached app shell",
      "SFX should be served cache-first from precache",
      "cross-origin backend requests must not be intercepted",
      "browserAutomation: false",
    ]),
  "Service-worker install/activate/fetch behavior is executed in a no-browser fake worker environment, including offline fallback and removed-music behavior");

  const distJsForServiceWorker = await Promise.all(
    (await walk("dist", (path) => extname(path).toLowerCase() === ".js"))
      .map(async (path) => ({ path, source: await text(path) }))
  );
  const distRegistration = distJsForServiceWorker.find(({ source }) => includesEvery(source, [
    "service-worker.js",
    "navigator.serviceWorker.register",
  ]));
  add("mobile:dist-registers-service-worker", !!distRegistration,
    distRegistration
      ? `Production bundle registers the service worker from ${distRegistration.path}`
      : "Production bundle is missing service-worker registration; run npm run build and inspect dist/assets");

  add("visual:game-juice-hooks", includesEvery(gameScene, [
    "MagnetTethers",
    "Particles",
    "cameraShakeOffset",
    "addCameraImpulse",
    "Bloom",
    "Vignette",
  ]) && includesEvery(cameraJuice, [
    "cameraImpulseForEvent",
    "knockoff",
    "steal",
    "bank",
    "powerup",
  ]) && [
    "src/game/scene/MenuBackground.tsx",
    "src/game/scene/Goals.tsx",
    "src/game/scene/Pickups.tsx",
    "src/game/scene/Table.tsx",
  ].every(existsSync), "Scene includes magnet tethers, particles, reduced-motion-safe camera shake, post effects, menu background, goals, pickups, and table modules");

  add("visual:pre-contact-affordance-labels", includesEvery(pickups, [
    "pickupAffordanceLabel",
    "applyBadgeTexture",
    "badgeWidthFor",
    "lastType",
  ]) && includesEvery(obstacles, [
    "SceneBadge",
    "OBSTACLE_AFFORDANCE",
  ]) && includesEvery(sceneBadge, [
    "getBadgeTexture",
    "spriteMaterial",
  ]) && includesEvery(sceneBadgeTexture, [
    "CanvasTexture",
    "normalizeBadgeText",
    "applyBadgeTexture",
  ]) && includesEvery(affordanceLabels, [
    "BLOCK",
    "AUTO",
  ]) && includesEvery(affordanceLabelsTest, [
    "MAG",
    "PULSE",
    "HEAVY",
    "short, distinct pre-pickup labels",
    "labels arena obstacles before players touch them",
  ]), "Powerups and later-round arena obstacles have lightweight in-world labels before contact, with metadata-driven no-browser coverage");

  add("online:authoritative-room-safety", includesEvery(serverIndex, [
    ".filterBy([\"mode\"])",
    "/health",
  ]) && includesEvery(arenaRoom, [
    "ServerError",
    "Room mode mismatch",
    "sanitizeInputIntent",
    "buildSnapshot",
  ]) && !arenaRoom.includes("onMessage(\"advance\""), "Server filters rooms by mode, exposes health/build info, sanitizes input, snapshots authoritative sim, and rejects wrong private-room modes");
  add("server:nanoid-compat-shim-covered", scripts["nanoid:smoke"] === "node scripts/nanoid-compat-smoke.mjs"
    && serverPackageJson.dependencies?.nanoid === "file:vendor/nanoid-compat"
    && serverPackageJson.overrides?.nanoid === "$nanoid"
    && noBrowser.includes("server:nanoid-compat-smoke")
    && releaseStatus.includes("server:nanoid-compat-smoke")
    && includesEvery(nanoidCompatSmoke, [
      "server/vendor/nanoid-compat",
      "CommonJS require('nanoid') must return a callable function",
      "module.exports = nanoid",
      "export default nanoid",
      "randomFillSync",
      "Math.random",
      "browserAutomation: false",
      "SAMPLE_COUNT",
    ])
    && readinessDoc.includes("nanoid compatibility smoke"),
  "Colyseus 0.16 nanoid compatibility shim is covered by a standalone no-browser smoke, safe gate, release dashboard, and docs mitigation");
  add("online:client-input-throttle-and-one-shots", includesEvery(netView, [
    "this.inputAccum >= 1 / 25",
    "forceAdvance()",
    "sanitizeInputIntent",
    "hasOneShot",
  ]), "NetView throttles continuous input, preserves one-shot actions, and disallows online force-advance");

  add("release:no-browser-gate-safe", scripts["validate:no-browser"] === "node scripts/no-browser-check.mjs"
    && !noBrowser.includes("startCdpBrowser")
    && !noBrowser.includes("cdp-browser")
    && !/npmRun\("(preview:smoke|modes:smoke|perf:smoke|soak:smoke|a11y:smoke|live:smoke)"/.test(noBrowser),
  "validate:no-browser is backed by a Node orchestrator and does not call browser/CDP smoke scripts");
  add("release:browser-automation-explicit-opt-in", scripts["browser:guard"] === "node scripts/browser-guard-smoke.mjs"
    && noBrowser.includes("\"browser:guard\"")
    && includesEvery(cdpBrowser, [
      "BROWSER_AUTOMATION_ENV",
      "MM_ALLOW_BROWSER",
      "browserLaunchAllowed",
      "browserLaunchOptInMessage",
      "if (!browserLaunchAllowed())",
    ])
    && ordered(cdpBrowser, "if (!browserLaunchAllowed())", "if (await cdpReady(port))")
    && includesEvery(launchCheck, [
      "ensureBrowserAutomationOptIn",
      "browser:opt-in",
      "browserLaunchOptInMessage()",
    ])
    && includesEvery(release, [
      "browserLaunchAllowed",
      "browserLaunchOptInMessage()",
      "skippedLiveStep(\"live:web\"",
    ])
    && includesEvery(browserGuard, [
      "browserAutomation: false",
      "BROWSER_SCRIPT_ALLOWLIST",
      "CDP_PAGE_SCRIPT_ALLOWLIST",
      "FORBIDDEN_NO_BROWSER_SCRIPTS",
      "scanBrowserScripts",
      "scanCdpPageLifecycle",
      "scanSharedBrowserOrchestrator",
      "closeCdpPage",
      "MM_REUSE_CDP",
      "scripts/live-web-smoke.mjs",
      "emptyEnvAllowed",
      "explicitEnvAllowed",
      "aliasEnvAllowed",
      "forbiddenNoBrowserScripts",
    ]),
  "Chrome/CDP launch requires explicit MM_ALLOW_BROWSER=1, browser-capable scripts are allowlisted/scanned, CDP page cleanup/shared reuse is enforced, and no-browser validation proves the guard without launching a browser");
  add("release:static-live-preflight-before-cdp", ordered(release, "liveWebBuildStep(commit)", "startCdpBrowser({")
    && ordered(release, "liveServerHealthStep(commit)", "startCdpBrowser({")
    && release.includes("Chrome/CDP was not started"),
  "release:verify checks live web/server build metadata before starting Chrome/CDP");
  add("release:no-browser-live-version-preflight", scripts["live:version"] === "node scripts/live-version-smoke.mjs"
    && includesEvery(liveVersion, [
      "browserAutomation: false",
      "cdpStarted: false",
      "./build.json",
      "/health",
      "LIVE_VERSION_EXPECT_COMMIT",
      "LIVE_VERSION_EXPECT_SOURCE_FINGERPRINT",
      "sourceFingerprint",
      "REMOVED_MUSIC_FILENAMES",
      "music.mp3",
      "music.ogg",
      "music.flac",
      "./audio/${file}",
      "checkedCount",
      "live:forbidden-background-music",
    ])
    && !liveVersion.includes("startCdpBrowser")
    && !liveVersion.includes("cdp-browser"),
  "live:version checks public frontend/backend build metadata without Chrome/CDP");
  add("release:no-browser-deploy-monitor", scripts["deploy:monitor"] === "node scripts/deploy-monitor.mjs"
    && includesEvery(deployMonitor, [
      "browserAutomation: false",
      "cdpStarted: false",
      "live:version",
      "scripts/live-version-smoke.mjs",
      "scripts/online-smoke.mjs",
      "scripts/online-modes-smoke.mjs",
      "scripts/online-disconnect-smoke.mjs",
      "DEPLOY_MONITOR_EXPECT_SOURCE_FINGERPRINT",
      "DEPLOY_MONITOR_RUN_PROTOCOL_ON_VERSION_FAIL",
    ])
    && !deployMonitor.includes("startCdpBrowser")
    && !deployMonitor.includes("cdp-browser")
    && includesEvery(deployMonitorWorkflow, [
      "schedule:",
      "workflow_dispatch:",
      "node-version: 22",
      "npm run deploy:monitor",
      "actions/upload-artifact@v4",
    ]),
  "Deploy monitoring proves live build metadata plus Classic/all-mode/disconnect online protocol without Chrome/CDP and is wired to a scheduled/manual workflow");
  add("release:no-browser-status-report", scripts["release:status"] === "node scripts/release-status.mjs"
    && includesEvery(releaseStatus, [
      "browserAutomation: false",
      "cdpStarted: false",
      "outputs/release-status.json",
      "outputs/release-status-live-version.json",
      "outputs/release-status-device-qa.json",
      "outputs/release-status-human-review.json",
      "outputs/release-status-hosting-config.json",
      "outputs/evidence-templates/evidence-template-report.json",
      "outputs/evidence-templates/reviewer-handoff.md",
      "DEVICE_QA_REQUIRE_EVIDENCE",
      "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE",
      "HOSTING_REQUIRE_LIVE_CONFIG",
      "RELEASE_STATUS_CHECK_HOSTING_LIVE",
      "hosting:render-live-config-checked",
      "evidence:templates-and-handoff-current",
      "dirtyScope",
      "live:version",
      "validate:no-browser",
      "nextActions",
      "releaseNextActions",
      "checkNamed",
      "liveReady",
      "reviewerHandoffReady",
      "After live:version passes, run npm run evidence:templates",
      "Do not collect or submit physical-device/human AA evidence",
      "MM_ALLOW_BROWSER=1",
      "no-browser blockers above are clear",
      "sourceFingerprintSync",
      "sourceFingerprintSource",
      "music.mp3",
      "This status command is report-only",
    ])
    && !releaseStatus.includes("startCdpBrowser")
    && !releaseStatus.includes("cdp-browser"),
  "release:status summarizes current release blockers, live version/music removal, device/human evidence, hosting config, and browser-gate next actions without launching Chrome/CDP");
  add("release:clean-failure-exits", scripts["clean-exit:smoke"] === "node scripts/clean-exit-smoke.mjs"
    && noBrowser.includes("web:clean-exit-smoke")
    && includesEvery(cleanExit, [
      "process.exit(",
      "process.exitCode = 1",
      "forbidsTopLevelColyseusImport",
      "requiresDynamicColyseusImport",
      "scripts/live-version-smoke.mjs",
      "scripts/deploy-monitor.mjs",
      "scripts/release-readiness.mjs",
      "scripts/online-smoke.mjs",
      "scripts/online-modes-smoke.mjs",
      "scripts/online-disconnect-smoke.mjs",
    ])
    && !liveVersion.includes("process.exit(")
    && !deployMonitor.includes("process.exit(")
    && !release.includes("process.exit(")
    && !onlineSmoke.includes("process.exit(")
    && !onlineModesSmoke.includes("process.exit(")
    && !onlineDisconnectSmoke.includes("process.exit("),
  "Live/deploy/release monitoring scripts use clean failure exits and avoid eager Colyseus imports before build metadata checks");
  add("release:physical-device-qa-evidence-gate", scripts["device:qa"] === "node scripts/device-qa-smoke.mjs"
    && noBrowser.includes("web:device-qa-smoke")
    && release.includes("RELEASE_REQUIRE_DEVICE_QA")
    && release.includes("scripts/device-qa-smoke.mjs")
    && release.includes("DEVICE_QA_REQUIRE_EVIDENCE")
    && includesEvery(deviceQa, [
      "browserAutomation: false",
      "DEVICE_QA_REQUIRE_EVIDENCE",
      "android-chrome-install-offline",
      "ios-safari-install-offline",
      "touch-controls-core-loop",
      "menu-readability-safe-area",
      "midrange-android-performance",
      "screen-reader-focus",
      "haptics-audio-feel",
      "online-cold-warm-recovery",
      "sourceFingerprint",
      "buildJson",
      "menuStamp",
      "candidate.buildJson.verifiedAt",
      "candidate.menuStamp.evidence",
      "PLACEHOLDER_PATTERN",
      "rejectPlaceholder",
    ])
    && includesEvery(deviceQaChecklist, [
      "outputs/device-qa-evidence.json",
      "Android Chrome",
      "iOS Safari",
      "midrange Android-class hardware",
      "screen-reader",
      "Candidate stamp",
      "candidate.buildJson",
      "candidate.menuStamp",
      "RELEASE_REQUIRE_DEVICE_QA=0",
      "npm run live:version",
      "live:version-current-and-no-music",
    ]),
  "Physical-device launch gaps have a no-browser checklist/schema validator and release:verify blocks public signoff without fresh current-candidate evidence");
  add("release:hosting-config-evidence-gate", scripts["hosting:smoke"] === "node scripts/hosting-config-smoke.mjs"
    && noBrowser.includes("web:hosting-config-smoke")
    && release.includes("RELEASE_REQUIRE_HOSTING_CONFIG")
    && release.includes("scripts/hosting-config-smoke.mjs")
    && release.includes("HOSTING_REQUIRE_LIVE_CONFIG")
    && includesEvery(hostingConfig, [
      "browserAutomation: false",
      "HOSTING_REQUIRE_LIVE_CONFIG",
      "magnet-marbles-server",
      "magnet-marbles",
      "starter",
      "/health",
      "VITE_SERVER_URL",
      "Render live config check failed",
      "Render API token not available",
    ]),
  "Render blueprint is validated without a browser and release:verify can require live Render service config evidence");
  add("release:human-aa-review-evidence-gate", scripts["human:review"] === "node scripts/human-review-smoke.mjs"
    && noBrowser.includes("web:human-review-smoke")
    && release.includes("RELEASE_REQUIRE_HUMAN_REVIEW")
    && release.includes("scripts/human-review-smoke.mjs")
    && release.includes("HUMAN_AA_REVIEW_REQUIRE_EVIDENCE")
    && includesEvery(humanReview, [
      "browserAutomation: false",
      "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE",
      "executive-producer-fun-30s",
      "gameplay-designer-core-loop",
      "mobile-ux-touch-readability",
      "art-audio-juice-aa",
      "accessibility-comfort",
      "release-qa-risk",
      "shipDecision",
      "sourceFingerprint",
      "buildJson",
      "menuStamp",
      "candidate.buildJson.verifiedAt",
      "candidate.menuStamp.evidence",
      "PLACEHOLDER_PATTERN",
      "rejectPlaceholder",
    ])
    && includesEvery(humanReviewChecklist, [
      "outputs/human-aa-review-evidence.json",
      "fun-in-30-seconds",
      "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review",
      "RELEASE_REQUIRE_HUMAN_REVIEW=0",
      "Candidate stamp",
      "candidate.buildJson",
      "candidate.menuStamp",
      "shipDecision",
      "npm run live:version",
      "live:version-current-and-no-music",
    ]),
  "Subjective AA launch judgment has a no-browser checklist/schema validator and release:verify blocks public signoff without fresh human review evidence");
  add("release:evidence-template-generator", scripts["evidence:templates"] === "node scripts/evidence-template.mjs"
    && noBrowser.includes("web:evidence-templates")
    && includesEvery(evidenceTemplate, [
      "outputs/evidence-templates",
      "device-qa-evidence.template.json",
      "human-aa-review-evidence.template.json",
      "reviewer-handoff.md",
      "outputs/device-qa-evidence.json",
      "outputs/human-aa-review-evidence.json",
      "DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa",
      "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review",
      "npm run release:status",
      "Required Captures",
      "Review Start Gate",
      "live:version-current-and-no-music",
      "staleLiveBuildInvalidatesEvidence",
      "sourceFingerprintSync",
      "buildJson",
      "menuStamp",
      "pass: false",
      "shipDecision: \"hold\"",
    ]),
  "Release evidence templates and reviewer handoff are generated with current candidate metadata into a non-gating output path and still require real filled evidence");
  add("release:evidence-template-negative-guard", scripts["evidence:negative"] === "node scripts/evidence-negative-smoke.mjs"
    && noBrowser.includes("web:evidence-negative-smoke")
    && includesEvery(evidenceNegative, [
      "DEVICE_QA_REQUIRE_EVIDENCE",
      "HUMAN_AA_REVIEW_REQUIRE_EVIDENCE",
      "device-qa-evidence.template.json",
      "human-aa-review-evidence.template.json",
      "candidate.buildJson.verifiedAt",
      "candidate.menuStamp.evidence",
      "shipDecision",
      "run.status !== 0",
      "browserAutomation: false",
    ]),
  "Generated review evidence templates are regression-checked to fail when used as final required evidence");
  add("release:candidate-stamp-for-qa", includesEvery(mainMenu, [
      "BUILD_INFO",
      "candidate-stamp",
      "candidateCommit",
      "candidateFingerprint",
      "source fingerprint",
    ])
    && includesEvery(styles, [
      ".candidate-stamp",
      ".launch-cluster",
      "@media (max-width: 640px)",
    ])
    && includesEvery(supportPage, [
      "Candidate ID",
      "build.json",
      "source fingerprint",
    ])
    && includesEvery(metadataSmoke, [
      "Candidate ID",
      "build.json",
      "source fingerprint",
    ])
    && deviceQaChecklist.includes("Candidate stamp")
    && humanReviewChecklist.includes("Candidate stamp"),
  "Menu/support surfaces expose a compact commit/source-fingerprint stamp so physical and human QA evidence can prove the exact tested candidate");
  add("release:source-fingerprint-provenance", scripts["source:fingerprint"] === "node scripts/source-fingerprint-smoke.mjs"
    && noBrowser.includes("web:source-fingerprint-smoke")
    && includesEvery(sourceFingerprint, [
    "sourceFingerprintSync",
    "sourceFingerprintDetailsSync",
    "createHash",
    "gitFingerprintFiles",
    "git-tree",
    "INCLUDED_DIRS",
    "\"scripts\"",
    "server/src",
    "src",
    "public",
    ".png",
    ".mp3",
    "TEXT_EXTENSIONS",
  ]) && includesEvery(sourceFingerprintSmoke, [
    "scripts/a11y-static-smoke.mjs",
    "scripts/mobile-layout-static-smoke.mjs",
    "scripts/service-worker-smoke.mjs",
    "scripts/evidence-template.mjs",
    "scripts/evidence-negative-smoke.mjs",
    "scripts/device-qa-smoke.mjs",
    "scripts/hosting-config-smoke.mjs",
    "scripts/human-review-smoke.mjs",
    "scripts/nanoid-compat-smoke.mjs",
    "scripts/release-status.mjs",
    "docs/DEVICE_QA_CHECKLIST.md",
    "docs/HUMAN_AA_REVIEW_CHECKLIST.md",
    "src/vite-env.d.ts",
    "src/game/serviceWorker.ts",
    "public/service-worker.js",
    "public/audio/sfx/pickup.mp3",
    "public/icons/icon-512.png",
    "public/social-card.png",
    "sourceFingerprintSource",
    "hashedFileCount",
    "source fingerprint is not deterministic",
    "scripts/browser-guard-smoke.mjs",
  ]) && includesEvery(viteConfig, [
    "sourceFingerprintDetailsSync",
    "MM_SOURCE_FINGERPRINT",
    "sourceFingerprintSource",
    "sourceFingerprintFileCount",
    "sourceFingerprint",
  ]) && !viteConfig.includes("process.env.SOURCE_FINGERPRINT")
    && includesEvery(serverIndex, [
    "__MM_SERVER_BUILD_INFO__",
    "MM_SOURCE_FINGERPRINT",
    "sourceFingerprintSource",
    "sourceFingerprintFileCount",
    "sourceFingerprint",
  ]) && !serverIndex.includes("process.env.SOURCE_FINGERPRINT")
    && serverPackageJson.scripts?.build === "node scripts/build.mjs"
    && includesEvery(serverBuild, [
      "sourceFingerprintDetailsSync",
      "__MM_SERVER_BUILD_INFO__",
      "MM_SOURCE_FINGERPRINT",
      "sourceFingerprintSource",
      "sourceFingerprintFileCount",
      "sourceFingerprint",
    ])
    && !serverBuild.includes("process.env.SOURCE_FINGERPRINT")
    && noBrowser.includes("MM_SOURCE_FINGERPRINT")
    && launchCheck.includes("MM_SOURCE_FINGERPRINT")
    && includesEvery(buildInfoSmoke, [
      "BUILD_INFO_EXPECT_SOURCE_FINGERPRINT",
      "sourceFingerprint",
    ])
    && includesEvery(release, [
      "RELEASE_EXPECT_SOURCE_FINGERPRINT",
      "buildMatchesCandidate",
      "ONLINE_EXPECT_BUILD_SOURCE_FINGERPRINT",
    ]),
  "Frontend build.json, runtime build info, server /health metadata, local build-info smoke, deploy monitor, and release verification share a source fingerprint guard");

  const requiredScripts = [
    "test",
    "vertical:slice",
    "sim:soak",
    "sim:perf",
    "lint",
    "build",
    "build-info:smoke",
    "metadata:smoke",
    "ip:safety",
    "sw:smoke",
    "assets:smoke",
    "nanoid:smoke",
    "dist:budget",
    "a11y:static",
    "mobile:layout",
    "browser:guard",
    "clean-exit:smoke",
    "evidence:templates",
    "evidence:negative",
    "device:qa",
    "hosting:smoke",
    "human:review",
    "source:fingerprint",
    "online:smoke",
    "online:modes:smoke",
    "online:disconnect:smoke",
    "live:version",
    "deploy:monitor",
    "launch:check",
    "release:status",
    "release:verify",
  ];
  add("release:quality-gate-scripts", requiredScripts.every((name) => typeof scripts[name] === "string"), `Package scripts include ${requiredScripts.join(", ")}`);
  add("release:ci-runs-no-browser-gate", includesEvery(ciWorkflow, [
    "node-version: 22",
    "npm ci --prefix server",
    "npm run validate:no-browser",
    "actions/upload-artifact@v4",
  ]), "CI installs web/server dependencies, runs the full no-browser validation gate, and uploads report artifacts");

  const launchFiles = [
    await fileExists("public/manifest.webmanifest", 500),
    await fileExists("public/service-worker.js", 1_500),
    await fileExists("public/privacy.html", 1_000),
    await fileExists("public/support.html", 1_000),
    await fileExists("public/icons/icon-192.png", 10_000),
    await fileExists("public/icons/icon-512.png", 50_000),
    await fileExists("public/icons/icon-maskable-512.png", 50_000),
    await fileExists("public/social-card.png", 100_000),
  ];
  add("metadata:install-share-support-assets", launchFiles.every((item) => item.pass), launchFiles.map((item) => item.evidence).join("; "));
  add("launch:fair-privacy-and-support-copy", includesEvery(privacyPage, [
    "does not use ads",
    "analytics trackers",
    "payment processing",
    "in-app purchases",
    "loot boxes",
    "online matches do not award account progression",
  ]) && includesEvery(supportPage, [
    "SFX volume",
    "Haptics",
    "lower-right thumb zone",
    "no purchases",
    "Do not include personal information",
  ]) && includesEvery(metadataSmoke, [
    "in-app purchases",
    "lower-right thumb zone",
    "no purchases",
  ]),
  "Privacy/support pages state no ads/tracking/payments/loot boxes, safe reporting, exact controls, and metadata smoke enforces the copy");

  add("launch:local-data-reset-control", includesEvery(store, [
    "export const SETTINGS_KEY",
    "export const TUTORIAL_KEY",
    "clearLocalGameData",
    "window.localStorage.removeItem(SETTINGS_KEY)",
    "window.localStorage.removeItem(PROGRESSION_KEY)",
    "window.localStorage.removeItem(TUTORIAL_KEY)",
    "clearLocalData",
    "progression: normalizeProgression(null)",
  ]) && includesEvery(storeTest, [
    "clears local game data without touching unrelated site storage",
    "unrelated:site-key",
    "SETTINGS_KEY",
    "TUTORIAL_KEY",
    "PROGRESSION_KEY",
    "normalizeProgression(DEFAULT_PROGRESSION)",
  ]) && includesEvery(mainMenu, [
    "confirmReset",
    "clearLocalData",
    "Reset data",
    "Confirm reset",
    "Reset local progress, settings, tutorial, daily streak, and marble skin data",
  ]) && includesEvery(styles, [
    ".reset-data-chip",
    ".reset-data-chip.confirm",
  ]) && includesEvery(privacyPage, [
    "game's Options",
    "main menu",
    "Reset data control",
  ]) && includesEvery(supportPage, [
    "Reset data in Options",
    "daily streaks",
    "two-step Reset data control",
  ]),
  "Players can reset local-only settings/progression/tutorial data from the game menu, with storage-key coverage and matching privacy/support copy");

  add("launch:public-ip-safety", scripts["ip:safety"] === "node scripts/ip-safety-smoke.mjs"
    && includesEvery(noBrowser, [
      "web:ip-safety-smoke",
      "IP_SAFETY_OUTPUT",
    ])
    && includesEvery(ipSafety, [
      "FORBIDDEN_REFERENCES",
      "public,dist,package.json",
      "Shipped/public IP reference scan failed",
      "Reference games may appear in internal docs/tests",
    ])
    && !String(packageJson.description || "").toLowerCase().includes("my street"),
  "Public package metadata and shipped public/dist files are guarded against protected reference-game names");

  const buildJson = existsSync("dist/build.json") ? await json("dist/build.json") : null;
  add("dist:production-build-provenance", buildJson?.name === packageJson.name
    && typeof buildJson?.commit === "string"
    && typeof buildJson?.builtAt === "string",
  buildJson ? `dist/build.json ${buildJson.commit} ${buildJson.builtAt}` : "dist/build.json is missing; run npm run build first");
  const distFiles = await walk("dist", (path) => extname(path).toLowerCase() !== ".map");
  const distMusicFiles = distFiles.filter((path) => musicFilePattern.test(path));
  const distMusicSizes = await Promise.all(distMusicFiles.map((path) => size(path)));
  add("dist:production-output-no-music-or-devmaps", distFiles.length > 0
    && distMusicFiles.length === 0
    && !(await walk("dist", (path) => extname(path).toLowerCase() === ".map")).length,
  `dist files scanned: ${distFiles.length}; music files: ${distMusicFiles.length}; music bytes: ${distMusicSizes.join(", ") || "none"}`);

  const testFiles = await walk("src", (path) => path.endsWith(".test.ts"));
  add("tests:focused-coverage-surface", testFiles.length >= 9
    && testFiles.some((path) => path.endsWith("verticalSlice.test.ts"))
    && testFiles.some((path) => path.endsWith("soak.test.ts"))
    && testFiles.some((path) => path.endsWith("performance.test.ts"))
    && testFiles.some((path) => path.endsWith("world.test.ts"))
    && testFiles.some((path) => path.endsWith("controls.test.ts")),
  `Test files: ${testFiles.length}`);

  add("docs:living-gap-and-asset-ledger", readinessDoc.includes("## Open Gaps")
    && (readinessDoc.includes("Public Render deployment is current")
      || readinessDoc.includes("Public Render deployment is not current")
      || readinessDoc.includes("Public Render frontend deployment is not current"))
    && assetBudget.includes("Tracked total")
    && assetBudget.includes("No audible background music currently ships"),
  "Launch readiness doc has open gaps and asset budget tracks spend plus no-music state");

  add("deploy:render-blueprint-present", includesEvery(renderYaml, [
    "magnet-marbles-server",
    "magnet-marbles",
    "healthCheckPath: /health",
    "staticPublishPath: ./dist",
    "VITE_SERVER_URL",
  ]), "Render blueprint defines static web service, authoritative server, health path, and websocket URL");
  add("deploy:always-on-backend-plan", /plan:\s*(?!free\b)[A-Za-z0-9_-]+/.test(renderYaml),
    "Render server is configured away from free-tier hosting for an always-on backend");

  const blockers = checks.filter((check) => !check.pass && check.severity !== "warning");
  const warnings = checks.filter((check) => !check.pass && check.severity === "warning");
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    checks,
    blockers,
    warnings,
    summary: {
      total: checks.length,
      passed: checks.filter((check) => check.pass).length,
      blockers: blockers.length,
      warnings: warnings.length,
    },
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    summary: report.summary,
    blockers: blockers.map((check) => check.name),
    warnings: warnings.map((check) => check.name),
  }, null, 2));

  if (!report.pass) process.exit(1);
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    error: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  } catch {
    /* ignore report write failures */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
