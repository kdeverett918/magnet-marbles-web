import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUTPUT = process.env.MOBILE_LAYOUT_STATIC_OUTPUT || "outputs/mobile-layout-static-smoke.json";

async function text(path) {
  return readFile(path, "utf8");
}

function includesEvery(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function add(checks, name, pass, evidence) {
  checks.push({ name, pass: Boolean(pass), evidence });
}

async function run() {
  const packageJson = JSON.parse(await text("package.json"));
  const index = await text("index.html");
  const mainMenu = await text("src/game/ui/MainMenu.tsx");
  const hud = await text("src/game/ui/Hud.tsx");
  const controls = await text("src/game/ui/Controls.tsx");
  const overlays = await text("src/game/ui/Overlays.tsx");
  const gameScene = await text("src/game/scene/GameScene.tsx");
  const styles = await text("src/styles.css");
  const deviceChecklist = await text("docs/DEVICE_QA_CHECKLIST.md");
  const readiness = await text("docs/WEB_LAUNCH_READINESS.md");
  const checks = [];

  add(checks, "automation:no-browser-static-only", packageJson.scripts?.["mobile:layout"] === "node scripts/mobile-layout-static-smoke.mjs"
    && !controls.includes("startCdpBrowser")
    && !styles.includes("startCdpBrowser"),
  "Mobile layout contract is a static source check and does not open Chrome/CDP");

  add(checks, "viewport:safe-area-and-touch-root", includesEvery(index, [
    "name=\"viewport\"",
    "width=device-width",
    "initial-scale=1",
    "viewport-fit=cover",
  ]) && includesEvery(styles, [
    "touch-action: none",
    "env(safe-area-inset-top)",
    "env(safe-area-inset-right)",
    "env(safe-area-inset-bottom)",
    "env(safe-area-inset-left)",
    "@media (max-width: 920px)",
    "@media (max-width: 640px)",
  ]),
  "Root viewport and CSS are phone-first, touch-locked, and safe-area aware");

  add(checks, "menu:phone-first-launch-surface", includesEvery(mainMenu, [
    "aria-label=\"Main menu\"",
    "SINGLE PLAYER",
    "PLAY ONLINE",
    "play-row",
    "mode-showcase",
    "power-strip",
    "progression-strip",
    "Daily challenge",
    "candidate-stamp",
    "Privacy",
    "Support",
    "Touch controls:",
    "hold the lower-right thumb zone for magnet",
    "tap or flick that zone to dash",
  ]) && includesEvery(styles, [
    ".menu-inner",
    ".menu-stage",
    ".play-row",
    ".play-btn",
    "min-height: 48px",
    ".launch-cluster",
    ".candidate-stamp",
    ".mode-showcase",
    ".quick-controls",
    ".menu-scrim",
  ]),
  "Main menu keeps play actions, candidate proof, mode/powerup context, and support links in the 390x844 phone layout target");

  add(checks, "hud:phone-safe-nonoverlap-contract", includesEvery(hud, [
    "scoreboard",
    "timer-wrap",
    "objective-chip",
    "race-chip",
    "cluster",
    "carry-advice",
    "corner-btn",
    "role=\"meter\"",
    "aria-valuetext",
  ]) && includesEvery(styles, [
    ".hud .topbar",
    ".scoreboard",
    ".timer-wrap",
    ".objective-chip",
    ".race-chip",
    ".cluster",
    "--hud-top: max(16px, env(safe-area-inset-top))",
    "top: calc(var(--hud-top) + 188px)",
    "bottom: auto",
    "max-width: min(190px, 48vw)",
    ".right-gesture-zone",
  ]),
  "Phone HUD has explicit top/safe-area positions and keeps the carried meter away from the lower-right controls");

  add(checks, "controls:two-thumb-magnet-dash-model", includesEvery(controls, [
    "right-gesture-zone",
    "aria-hidden=\"true\"",
    "setPointerCapture",
    "onPointerCancel",
    "setTouchMagnetHeld",
    "rightGestureShouldDash",
    "hold magnet",
    "tap / flick dash",
    "drag to move",
    "actionStatusFor",
    "action-status",
    "Use ${heldMeta.label}: ${heldMeta.desc}",
    "aria-label={dashReady ? \"Dash ready\" : `Dash cooling down ${dashCooldownLabel} seconds`}",
    "aria-label={magnetOn ? \"Magnet pulling\" : \"Hold magnet\"}",
  ]) && includesEvery(styles, [
    ".right-gesture-zone",
    "width: 56%",
    "height: min(58vh, 520px)",
    ".gesture-hint",
    "right: max(18px, env(safe-area-inset-right))",
    "bottom: max(154px, calc(env(safe-area-inset-bottom) + 144px))",
    ".action-status",
    ".action-pill",
    ".action-cluster",
    "bottom: max(16px, env(safe-area-inset-bottom))",
  ]) && includesEvery(gameScene, [
    "window.innerWidth <= 760",
    "(pointer: coarse)",
  ]),
  "Touch controls match direct-drag movement plus lower-right hold-magnet and tap/flick dash on coarse pointers");

  add(checks, "targets:thumb-sized-primary-actions", includesEvery(styles, [
    ".play-btn",
    "min-height: 58px",
    "min-height: 48px",
    ".act {",
    "width: 64px",
    "height: 64px",
    ".act.big { width: 92px; height: 92px",
    "width: 58px",
    "height: 58px",
    ".act.big",
    "width: 82px",
    "height: 82px",
    ".mode {",
    "min-height: 92px",
    "min-height: 62px",
  ]) && countMatches(styles, /:focus-visible/g) >= 1,
  "Primary play, mode, magnet, dash, and powerup targets stay thumb-sized with visible focus styles");

  add(checks, "overlays:phone-flow-and-rematch", includesEvery(overlays, [
    "pause-overlay",
    "pause-card",
    "Resume",
    "Restart",
    "Menu",
    "Round plan",
    "Again",
    "Stars earned",
    "Next round starting",
  ]) && includesEvery(styles, [
    ".intro-brief",
    ".countdown",
    ".results",
    ".pause-card",
    "@media (max-width: 640px)",
  ]),
  "Pause, intro, and results overlays expose a complete phone round flow without relying on browser automation");

  add(checks, "release:physical-phone-review-still-required", includesEvery(deviceChecklist, [
    "outputs/device-qa-evidence.json",
    "Android Chrome",
    "iOS Safari",
    "touch-controls-core-loop",
    "menu-readability-safe-area",
    "midrange-android-performance",
    "haptics-audio-feel",
  ]) && includesEvery(readiness, [
    "Mobile install/offline resilience",
    "physical-phone install/offline review",
    "Mobile menu composition",
    "glare, OLED contrast, and notch/safe-area variance",
    "Performance evidence is better but still incomplete",
  ]),
  "Static mobile checks reduce local risk but keep real phone install, safe-area, glare, haptic, and performance evidence as release blockers");

  const blockers = checks.filter((check) => !check.pass);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    checks,
    blockers,
    summary: {
      total: checks.length,
      passed: checks.filter((check) => check.pass).length,
      blockers: blockers.length,
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
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
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
  process.exitCode = 1;
});
