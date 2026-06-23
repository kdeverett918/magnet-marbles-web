import {
  BROWSER_AUTOMATION_ALIASES,
  BROWSER_AUTOMATION_ENV,
  browserLaunchAllowed,
  browserLaunchOptInMessage,
} from "./lib/cdp-browser.mjs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const BROWSER_SCRIPT_ALLOWLIST = new Set([
  "scripts/a11y-smoke.mjs",
  "scripts/browser-guard-smoke.mjs",
  "scripts/browser-soak-smoke.mjs",
  "scripts/launch-check.mjs",
  "scripts/lib/cdp-browser.mjs",
  "scripts/live-web-smoke.mjs",
  "scripts/mobile-perf-smoke.mjs",
  "scripts/modes-smoke.mjs",
  "scripts/perf-smoke.mjs",
  "scripts/preview-smoke.mjs",
  "scripts/release-readiness.mjs",
]);

const FORBIDDEN_NO_BROWSER_SCRIPTS = [
  "preview:smoke",
  "modes:smoke",
  "perf:smoke",
  "perf:mobile:smoke",
  "soak:smoke",
  "a11y:smoke",
  "live:smoke",
  "launch:check",
  "release:verify",
];

const BROWSER_SOURCE_MARKERS = [
  "connectOverCDP",
  "chromium.launch",
  "playwright",
];

const CDP_PAGE_SCRIPT_ALLOWLIST = new Set([
  "scripts/a11y-smoke.mjs",
  "scripts/browser-soak-smoke.mjs",
  "scripts/mobile-perf-smoke.mjs",
  "scripts/modes-smoke.mjs",
  "scripts/perf-smoke.mjs",
  "scripts/preview-smoke.mjs",
]);

async function walkScripts(dir = "scripts", out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) await walkScripts(path, out);
    else if (entry.isFile() && path.endsWith(".mjs")) out.push(path);
  }
  return out;
}

function usesBrowserAutomation(source) {
  return /from\s+["'].+cdp-browser\.mjs["']/.test(source)
    || /import\(["'].\/preview-smoke\.mjs["']\)/.test(source)
    || BROWSER_SOURCE_MARKERS.some((marker) => source.includes(marker));
}

function appearsToLaunchBrowserDirectly(source) {
  return /from\s+["']node:child_process["']/.test(source)
    && source.includes("spawn(")
    && /google-chrome|chromium|msedge|chrome\.exe|--headless=new/i.test(source);
}

function ordered(source, first, second) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  return a >= 0 && b >= 0 && a < b;
}

function hasFinallyCleanup(source) {
  return /finally\s*{[\s\S]*client\?\.close\(\)[\s\S]*closeCdpPage\(PORT,\s*page\?\.id\)[\s\S]*stopCdpBrowser\(browser\)/.test(source);
}

function scanCdpPageLifecycle(path, source, issues) {
  if (!/import\s+\{[^}]*createCdpPage[^}]*\}\s+from\s+["'].+cdp-browser\.mjs["']/.test(source)) return;

  if (!CDP_PAGE_SCRIPT_ALLOWLIST.has(path)) {
    issues.push(`${path} creates a CDP page but is not in CDP_PAGE_SCRIPT_ALLOWLIST`);
  }
  for (const required of ["closeCdpPage", "stopCdpBrowser", "client?.close()", "finally {"]) {
    if (!source.includes(required)) issues.push(`${path} creates a CDP page but is missing cleanup marker ${required}`);
  }
  if (!ordered(source, "createCdpPage(", "closeCdpPage(PORT, page?.id)")) {
    issues.push(`${path} must close the CDP page it creates`);
  }
  if (!hasFinallyCleanup(source)) {
    issues.push(`${path} must close the client, close the CDP page, and stop the browser in a finally block`);
  }
  if (source.includes("startCdpBrowser({") && !source.includes("reuseOnly: REUSE_CDP")) {
    issues.push(`${path} must pass reuseOnly: REUSE_CDP to avoid launching extra browsers during shared-CDP launch checks`);
  }
  if (!source.includes('process.env.MM_REUSE_CDP === "1"')) {
    issues.push(`${path} must honor MM_REUSE_CDP for shared browser reuse`);
  }
}

function scanSharedBrowserOrchestrator(path, source, issues) {
  if (path === "scripts/launch-check.mjs") {
    for (const required of ["ensureSharedBrowser", "MM_REUSE_CDP: \"1\"", "browserSmokeEnv", "await stopCdpBrowser(processInfo.browser)"]) {
      if (!source.includes(required)) issues.push(`${path} is missing shared-browser reuse/cleanup marker ${required}`);
    }
    if (!ordered(source, "ensure:shared-browser", "smoke:a11y")) {
      issues.push(`${path} must start/reuse the shared browser before browser smoke scripts`);
    }
  }
  if (path === "scripts/release-readiness.mjs") {
    for (const required of ["MM_REUSE_CDP: \"1\"", "scripts/live-web-smoke.mjs", "await stopCdpBrowser(browser)", "browserLaunchAllowed()"]) {
      if (!source.includes(required)) issues.push(`${path} is missing live browser opt-in/reuse/cleanup marker ${required}`);
    }
    if (!ordered(source, "liveServerHealthStep(commit)", "startCdpBrowser({")) {
      issues.push(`${path} must finish static live preflight before starting Chrome/CDP`);
    }
  }
  if (path === "scripts/live-web-smoke.mjs" && !source.includes('await import("./preview-smoke.mjs")')) {
    issues.push(`${path} must remain a thin preview-smoke wrapper so cleanup stays centralized`);
  }
}

async function scanBrowserScripts() {
  const files = await walkScripts();
  const browserScripts = [];
  const issues = [];

  for (const path of files) {
    const source = await readFile(path, "utf8");
    if (!usesBrowserAutomation(source)) continue;

    browserScripts.push(path);
    if (!BROWSER_SCRIPT_ALLOWLIST.has(path)) {
      issues.push(`${path} uses browser/CDP automation but is not in BROWSER_SCRIPT_ALLOWLIST`);
    }
    if (path !== "scripts/lib/cdp-browser.mjs" && appearsToLaunchBrowserDirectly(source)) {
      issues.push(`${path} appears to spawn a browser directly; route browser launch through scripts/lib/cdp-browser.mjs`);
    }
    scanCdpPageLifecycle(path, source, issues);
    scanSharedBrowserOrchestrator(path, source, issues);
  }

  for (const expected of BROWSER_SCRIPT_ALLOWLIST) {
    if (!files.includes(expected)) issues.push(`${expected} is allowlisted but missing`);
  }

  const noBrowser = await readFile("scripts/no-browser-check.mjs", "utf8");
  const forbiddenNoBrowserScripts = FORBIDDEN_NO_BROWSER_SCRIPTS.filter((scriptName) => noBrowser.includes(`"${scriptName}"`));
  for (const scriptName of forbiddenNoBrowserScripts) {
    issues.push(`validate:no-browser must not run browser script ${scriptName}`);
  }

  return {
    pass: issues.length === 0,
    allowlist: [...BROWSER_SCRIPT_ALLOWLIST].sort(),
    cdpPageAllowlist: [...CDP_PAGE_SCRIPT_ALLOWLIST].sort(),
    browserScripts: browserScripts.sort(),
    forbiddenNoBrowserScripts,
    issues,
  };
}

const report = {
  pass: false,
  capturedAt: new Date().toISOString(),
  browserAutomation: false,
  checkedEnv: [BROWSER_AUTOMATION_ENV, ...BROWSER_AUTOMATION_ALIASES],
};

try {
  const emptyEnvAllowed = browserLaunchAllowed({});
  const explicitEnvAllowed = browserLaunchAllowed({ [BROWSER_AUTOMATION_ENV]: "1" });
  const aliasEnvAllowed = browserLaunchAllowed({ [BROWSER_AUTOMATION_ALIASES[0]]: "1" });
  const message = browserLaunchOptInMessage();
  const scriptScan = await scanBrowserScripts();

  report.pass = !emptyEnvAllowed
    && explicitEnvAllowed
    && aliasEnvAllowed
    && message.includes(BROWSER_AUTOMATION_ENV)
    && scriptScan.pass;
  report.evidence = {
    emptyEnvAllowed,
    explicitEnvAllowed,
    aliasEnvAllowed,
    message,
    scriptScan,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
