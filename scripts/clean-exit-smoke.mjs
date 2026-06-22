import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUTPUT = process.env.CLEAN_EXIT_OUTPUT || "outputs/clean-exit-smoke.json";

const guardedScripts = [
  {
    path: "scripts/live-version-smoke.mjs",
    requiresExitCode: true,
  },
  {
    path: "scripts/deploy-monitor.mjs",
    requiresExitCode: true,
  },
  {
    path: "scripts/release-readiness.mjs",
    requiresExitCode: true,
  },
  {
    path: "scripts/online-smoke.mjs",
    requiresExitCode: true,
    forbidsTopLevelColyseusImport: true,
    requiresDynamicColyseusImport: true,
  },
  {
    path: "scripts/online-modes-smoke.mjs",
    requiresExitCode: true,
    forbidsTopLevelColyseusImport: true,
    requiresDynamicColyseusImport: true,
  },
  {
    path: "scripts/online-disconnect-smoke.mjs",
    requiresExitCode: true,
    forbidsTopLevelColyseusImport: true,
    requiresDynamicColyseusImport: true,
  },
];

function hasTopLevelColyseusImport(source) {
  return /import\s+\{?\s*Client\s*\}?\s+from\s+["']colyseus\.js["']/.test(source);
}

async function run() {
  const checks = [];
  for (const script of guardedScripts) {
    const source = await readFile(script.path, "utf8");
    const hasHardExit = source.includes("process.exit(");
    const hasExitCode = source.includes("process.exitCode = 1");
    const topLevelColyseusImport = hasTopLevelColyseusImport(source);
    const dynamicColyseusImport = source.includes('await import("colyseus.js")')
      || source.includes("await import('colyseus.js')");
    const pass = !hasHardExit
      && (!script.requiresExitCode || hasExitCode)
      && (!script.forbidsTopLevelColyseusImport || !topLevelColyseusImport)
      && (!script.requiresDynamicColyseusImport || dynamicColyseusImport);
    checks.push({
      path: script.path,
      pass,
      hasHardExit,
      hasExitCode,
      topLevelColyseusImport,
      dynamicColyseusImport,
    });
  }

  const blockers = checks
    .filter((check) => !check.pass)
    .map((check) => `${check.path}: hardExit=${check.hasHardExit}, exitCode=${check.hasExitCode}, topLevelColyseus=${check.topLevelColyseusImport}, dynamicColyseus=${check.dynamicColyseusImport}`);
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    checks,
    blockers,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
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
