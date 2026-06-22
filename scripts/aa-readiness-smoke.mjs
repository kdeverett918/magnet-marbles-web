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
  const serviceWorkerRegistration = await text("src/game/serviceWorker.ts");
  const serviceWorker = await text("public/service-worker.js");
  const viteConfig = await text("vite.config.ts");
  const config = await text("src/game/data/config.ts");
  const feedback = await text("src/game/data/feedback.ts");
  const identity = await text("src/game/data/identity.ts");
  const world = await text("src/game/sim/world.ts");
  const store = await text("src/game/store.ts");
  const mainMenu = await text("src/game/ui/MainMenu.tsx");
  const hud = await text("src/game/ui/Hud.tsx");
  const overlays = await text("src/game/ui/Overlays.tsx");
  const controls = await text("src/game/ui/Controls.tsx");
  const gameScene = await text("src/game/scene/GameScene.tsx");
  const players = await text("src/game/scene/Players.tsx");
  const marbleMaterial = await text("src/game/scene/marbleMaterial.ts");
  const cameraJuice = await text("src/game/scene/cameraJuice.ts");
  const styles = await text("src/styles.css");
  const sfx = await text("src/game/audio/sfx.ts");
  const haptics = await text("src/game/haptics/haptics.ts");
  const progression = await text("src/game/data/progression.ts");
  const noBrowser = await text("scripts/no-browser-check.mjs");
  const sourceFingerprint = await text("scripts/lib/source-fingerprint.cjs");
  const sourceFingerprintSmoke = await text("scripts/source-fingerprint-smoke.mjs");
  const buildInfoSmoke = await text("scripts/build-info-smoke.mjs");
  const launchCheck = await text("scripts/launch-check.mjs");
  const release = await text("scripts/release-readiness.mjs");
  const liveVersion = await text("scripts/live-version-smoke.mjs");
  const deployMonitor = await text("scripts/deploy-monitor.mjs");
  const onlineSmoke = await text("scripts/online-smoke.mjs");
  const onlineModesSmoke = await text("scripts/online-modes-smoke.mjs");
  const onlineDisconnectSmoke = await text("scripts/online-disconnect-smoke.mjs");
  const cdpBrowser = await text("scripts/lib/cdp-browser.mjs");
  const browserGuard = await text("scripts/browser-guard-smoke.mjs");
  const cleanExit = await text("scripts/clean-exit-smoke.mjs");
  const assetsSmoke = await text("scripts/assets-smoke.mjs");
  const distBudget = await text("scripts/dist-budget-smoke.mjs");
  const ipSafety = await text("scripts/ip-safety-smoke.mjs");
  const serverIndex = await text("server/src/index.ts");
  const serverBuild = await text("server/scripts/build.mjs");
  const arenaRoom = await text("server/src/ArenaRoom.ts");
  const netView = await text("src/game/net/NetView.ts");
  const verticalSlice = await text("src/game/data/verticalSlice.test.ts");
  const worldTest = await text("src/game/sim/world.test.ts");
  const hudModelTest = await text("src/game/ui/hudModel.test.ts");
  const storeTest = await text("src/game/store.test.ts");
  const identityTest = await text("src/game/data/identity.test.ts");
  const accessibilityTest = await text("src/game/data/accessibility.test.ts");
  const readinessDoc = await text("docs/WEB_LAUNCH_READINESS.md");
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
  add("gameplay:my-street-core-loop", includesEvery(verticalSlice, [
    "proves the playable My Street-style core loop",
    "magnet: true",
    "toBe(\"carried\")",
    "toBeGreaterThan(firstScore)",
    "botState",
    "matchEnd",
    "rematch",
  ]), "Vertical-slice test proves move, magnet, carry, bank, bots, match end, and rematch");
  add("gameplay:magnet-carry-combat-tuning", includesEvery(config, [
    "clusterCap: 18",
    "stealFraction",
    "shockPulseDropFraction",
    "heavyCoreMassMult",
    "bankWhenCluster",
    "scoreEvery: 2",
  ]), "Magnet carry cap, steal, shock pulse, heavy core, bot banking, and King Magnet scoring tunables are present");
  add("gameplay:launch-powerup-trio", includesEvery(verticalSlice, [
    "MVP_POWERUPS",
    "magnetBurst",
    "shockPulse",
    "heavyCore",
  ]) && includesEvery(config, [
    "Magnet Burst",
    "Shock Pulse",
    "Heavy Core",
  ]), "Launch pool is locked to Magnet Burst, Shock Pulse, and Heavy Core");

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

  add("ui:premium-phone-menu", includesEvery(mainMenu, [
    "MenuBackground",
    "SINGLE PLAYER",
    "PLAY ONLINE",
    "mode-showcase",
    "power-strip",
    "progression-strip",
    "Privacy",
    "Support",
  ]) && includesEvery(styles, [
    ".menu-scrim",
    ".menu-stage",
    "@media (max-width: 640px)",
  ]), "Menu has a themed 3D background, first-screen play actions, mode showcase, progression, and mobile CSS");

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

  add("ui:moment-to-moment-feedback", includesEvery(feedback, [
    "feedbackForEvents",
    "Haul growing",
    "Cluster full",
    "Huge bank",
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

  add("input:phone-touch-model", includesEvery(controls, [
    "lower-right",
    "hold magnet",
    "tap / flick dash",
    "rightGestureShouldDash",
    "setTouchMagnetHeld",
  ]) && includesEvery(await text("src/game/input/controls.test.ts"), [
    "tracks direct-drag targets",
    "expect(input.dash).toBe(false)",
  ]), "Touch model matches drag-to-move plus lower-right hold/tap dash regression coverage");

  const expectedSfx = ["pickup", "bank", "hit", "shock-pulse", "magnet-burst", "fall"];
  const sfxFiles = await Promise.all(expectedSfx.map((name) => fileExists(`public/audio/sfx/${name}.mp3`, 4_000)));
  const publicMusicMissing = !existsSync("public/audio/music.mp3");
  const distMusicMissing = !existsSync("dist/audio/music.mp3");
  add("audio:six-shipped-sfx", sfxFiles.every((item) => item.pass), sfxFiles.map((item) => item.evidence).join("; "));
  add("audio:sfx-only-no-music", publicMusicMissing
    && distMusicMissing
    && !sfx.includes("music(")
    && !sfx.includes("music.mp3")
    && assetsSmoke.includes("assertNoMusicFile")
    && distBudget.includes("background music is disabled"),
  `Background music runtime is disabled and audio/music.mp3 is absent from public/dist (${publicMusicMissing}/${distMusicMissing})`);
  add("audio:player-sfx-volume-control", includesEvery(sfx, [
    "setVolume",
    "applyMasterGain",
    "this.volume",
  ]) && includesEvery(store, [
    "sfxVolume",
    "setSfxVolume",
    "clamp01",
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
  ]),
  "SFX volume is persisted, clamped, applied to the WebAudio master gain, and exposed in menu plus pause options");

  add("mobile:haptics-feedback", includesEvery(haptics, [
    "navigator.vibrate",
    "hapticPatternForEvent",
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
    "REMOVED_AUDIO_PATHS",
    "purgeRemovedAssets",
    "removedAudioResponse",
    "status: 410",
    "./build.json",
    "networkFirst",
    "cacheFirst",
    "sameOrigin(request)",
    "clients.claim",
  ]) && includesEvery(await text("scripts/metadata-smoke.mjs"), [
    "service-worker.js",
    "networkFirst",
    "cacheFirst",
  ]),
  "PWA service worker skips local development hosts, caches the app shell/SFX, purges removed music, keeps build metadata network-first, and is enforced by metadata smoke");

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

  add("online:authoritative-room-safety", includesEvery(serverIndex, [
    ".filterBy([\"mode\"])",
    "/health",
  ]) && includesEvery(arenaRoom, [
    "ServerError",
    "Room mode mismatch",
    "sanitizeInputIntent",
    "buildSnapshot",
  ]) && !arenaRoom.includes("onMessage(\"advance\""), "Server filters rooms by mode, exposes health/build info, sanitizes input, snapshots authoritative sim, and rejects wrong private-room modes");
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
      "emptyEnvAllowed",
      "explicitEnvAllowed",
      "aliasEnvAllowed",
    ]),
  "Chrome/CDP launch requires explicit MM_ALLOW_BROWSER=1 and no-browser validation proves the guard without launching a browser");
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
      "audio/music.mp3",
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
    "src/vite-env.d.ts",
    "src/game/serviceWorker.ts",
    "public/service-worker.js",
    "public/audio/sfx/pickup.mp3",
    "public/icons/icon-512.png",
    "public/social-card.png",
    "sourceFingerprintSource",
    "hashedFileCount",
    "source fingerprint is not deterministic",
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
    "lint",
    "build",
    "build-info:smoke",
    "metadata:smoke",
    "ip:safety",
    "assets:smoke",
    "dist:budget",
    "browser:guard",
    "clean-exit:smoke",
    "source:fingerprint",
    "online:smoke",
    "online:modes:smoke",
    "online:disconnect:smoke",
    "live:version",
    "deploy:monitor",
    "launch:check",
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
  ]) && includesEvery(await text("scripts/metadata-smoke.mjs"), [
    "in-app purchases",
    "lower-right thumb zone",
    "no purchases",
  ]),
  "Privacy/support pages state no ads/tracking/payments/loot boxes, safe reporting, exact controls, and metadata smoke enforces the copy");

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
  const distMusicFiles = distFiles.filter((path) => /audio[\\/]+music\.(mp3|wav|ogg|m4a)$/i.test(path));
  const distMusicSizes = await Promise.all(distMusicFiles.map((path) => size(path)));
  add("dist:production-output-no-music-or-devmaps", distFiles.length > 0
    && distMusicFiles.length === 0
    && !(await walk("dist", (path) => extname(path).toLowerCase() === ".map")).length,
  `dist files scanned: ${distFiles.length}; music files: ${distMusicFiles.length}; music bytes: ${distMusicSizes.join(", ") || "none"}`);

  const testFiles = await walk("src", (path) => path.endsWith(".test.ts"));
  add("tests:focused-coverage-surface", testFiles.length >= 9
    && testFiles.some((path) => path.endsWith("verticalSlice.test.ts"))
    && testFiles.some((path) => path.endsWith("soak.test.ts"))
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
