import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUTPUT = process.env.A11Y_STATIC_OUTPUT || "outputs/a11y-static-smoke.json";

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
  const mainMenu = await text("src/game/ui/MainMenu.tsx");
  const hud = await text("src/game/ui/Hud.tsx");
  const controls = await text("src/game/ui/Controls.tsx");
  const overlays = await text("src/game/ui/Overlays.tsx");
  const hudModelTest = await text("src/game/ui/hudModel.test.ts");
  const storeTest = await text("src/game/store.test.ts");
  const accessibilityTest = await text("src/game/data/accessibility.test.ts");
  const styles = await text("src/styles.css");
  const deviceChecklist = await text("docs/DEVICE_QA_CHECKLIST.md");
  const humanChecklist = await text("docs/HUMAN_AA_REVIEW_CHECKLIST.md");
  const readiness = await text("docs/WEB_LAUNCH_READINESS.md");
  const checks = [];

  add(checks, "menu:screen-reader-input-guidance", includesEvery(mainMenu, [
    "aria-describedby=\"input-help\"",
    "id=\"input-help\"",
    "className=\"sr-only\"",
    "Keyboard controls:",
    "Touch controls:",
    "drag on the playfield to move",
    "hold the lower-right thumb zone for magnet",
    "tap or flick that zone to dash",
  ]) && !mainMenu.includes("menu-foot"),
  "Main menu exposes keyboard/touch guidance through sr-only copy and no visible shortcut footer");

  add(checks, "menu:controls-have-names-and-state", includesEvery(mainMenu, [
    "aria-label=\"Main menu\"",
    "aria-label=\"Launch information\"",
    "aria-label={`Candidate build",
    "aria-expanded={showRoom}",
    "aria-label=\"Private room code\"",
    "aria-label=\"Bot difficulty\"",
    "aria-label=\"Bot roles\"",
    "aria-label=\"Sound effects volume\"",
    "aria-label=\"Play a short sound effect at the current SFX volume\"",
    "aria-label=\"Play a short phone vibration preview\"",
    "aria-label=\"Reset local progress, settings, tutorial, daily streak, and marble skin data\"",
  ]) && countMatches(mainMenu, /aria-pressed=/g) >= 10,
  "Menu controls expose names, pressed/expanded states, candidate stamp, and reset-data warning");

  add(checks, "hud:polite-status-and-meter-semantics", includesEvery(hud, [
    "aria-describedby=\"hud-objective-status\"",
    "id=\"hud-objective-status\"",
    "role=\"status\"",
    "aria-live=\"polite\"",
    "aria-atomic=\"true\"",
    "role=\"meter\"",
    "aria-label=\"Carried marbles\"",
    "aria-valuemin={0}",
    "aria-valuemax={hud.clusterCap}",
    "aria-valuenow={you.cluster}",
    "aria-valuetext",
    "Race status:",
    "Carry advice:",
    "Bank streak",
  ]),
  "HUD provides polite objective/race/feedback announcements and a semantic carried-marble meter");

  add(checks, "controls:touch-actions-accessible", includesEvery(controls, [
    "aria-hidden=\"true\"",
    "right-gesture-zone",
    "action-status",
    "action-pill",
    "move-hint",
    "drag to move",
    "aria-label={heldMeta ? `Use ${heldMeta.label}: ${heldMeta.desc}` : \"No powerup ready\"}",
    "aria-label={dashReady ? \"Dash ready\" : `Dash cooling down ${dashCooldownLabel} seconds`}",
    "aria-label={magnetOn ? \"Magnet pulling\" : \"Hold magnet\"}",
    "aria-pressed={magnetOn}",
    "onPointerCancel",
  ]),
  "Visible touch action buttons and compact state chips have names/state while the broad gesture zone stays hidden from assistive tech");

  add(checks, "overlays:pause-results-focus-and-labels", includesEvery(overlays, [
    "role=\"dialog\"",
    "aria-modal=\"true\"",
    "aria-labelledby=\"pause-title\"",
    "pauseResumeRef.current?.focus({ preventScroll: true })",
    "previous.focus({ preventScroll: true })",
    "aria-label=\"Resume game\"",
    "aria-label=\"Restart match\"",
    "aria-label=\"Return to menu\"",
    "aria-label=\"Pause options\"",
    "aria-label=\"Round plan\"",
    "aria-label={`${recap.eyebrow}:",
    "aria-label=\"Stars earned\"",
  ]),
  "Pause dialog traps initial focus/restore, results have accessible recap/reward labels, and intro has a labelled plan");

  add(checks, "css:focus-safe-area-reduced-motion", includesEvery(styles, [
    ".sr-only",
    "clip: rect(0, 0, 0, 0)",
    ":focus-visible",
    "outline: 3px solid",
    "env(safe-area-inset-top)",
    "env(safe-area-inset-bottom)",
    "@media (prefers-reduced-motion: reduce)",
    "animation-duration: 0.001ms !important",
    "transition-duration: 0.001ms !important",
  ]),
  "CSS includes sr-only utility, visible focus rings, safe-area offsets, and reduced-motion fallback");

  add(checks, "settings:accessibility-comfort-options", includesEvery(mainMenu + overlays, [
    "Color Assist",
    "Motion amount",
    "Sound effects volume",
    "Test SFX",
    "Haptics",
    "Test Haptics",
    "Lite",
  ]) && includesEvery(storeTest + accessibilityTest, [
    "persists the Color Assist readability setting",
    "persists the motion accessibility setting",
    "resolveReducedMotion",
  ]),
  "Player-facing comfort controls are present and covered by persistence/reduced-motion tests");

  add(checks, "tests:screen-reader-model-coverage", includesEvery(hudModelTest, [
    "builds concise screen-reader objective announcements without timer spam",
    "compact first-round coach",
    "Classic chase and lead pressure",
    "compact risk and banking advice",
    "compact intro briefings",
    "summarizes Classic result recap gaps",
    "uses shared-team language for Team Bank result recap",
    "turns Survival elimination into readable result recap advice",
  ]) && existsSync("src/game/data/accessibility.test.ts"),
  "Pure tests cover objective announcements, coach/race/carry/result copy, and accessibility setting helpers");

  add(checks, "release:manual-a11y-evidence-required", includesEvery(deviceChecklist, [
    "screen-reader-focus",
    "human assistive-tech pass",
    "focus visibility",
    "objective announcement",
    "carried-marble meter semantics",
  ]) && includesEvery(humanChecklist, [
    "accessibility-comfort",
    "Color Assist",
    "Motion settings",
    "screen-reader status",
    "haptics/sound toggles",
  ]) && includesEvery(readiness, [
    "human screen-reader pass",
    "physical-device checks for focus visibility",
  ]),
  "Manual physical-device and human-review evidence still explicitly gate screen-reader/focus comfort");

  add(checks, "automation:browser-a11y-remains-opt-in", packageJson.scripts?.["a11y:smoke"] === "node scripts/a11y-smoke.mjs"
    && packageJson.scripts?.["a11y:static"] === "node scripts/a11y-static-smoke.mjs",
  "Browser a11y smoke remains available separately while the safe gate uses the no-browser static contract");

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
