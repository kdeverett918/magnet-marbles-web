import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const DEFAULT_CDP_PORT = 9559;
export const BROWSER_AUTOMATION_ENV = "MM_ALLOW_BROWSER";
export const BROWSER_AUTOMATION_ALIASES = ["ALLOW_BROWSER_AUTOMATION"];

const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
];

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findBrowser() {
  for (const candidate of browserCandidates.filter(Boolean)) {
    const result = await new Promise((resolve) => {
      const child = spawn(candidate, ["--version"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => resolve(null));
      child.on("exit", (code) => resolve(code === 0 ? candidate : null));
    });
    if (result) return result;
  }
  throw new Error("Chrome/Edge executable not found. Set CHROME_PATH to run browser smoke tests.");
}

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

export async function cdpReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { cache: "no-store" });
    return response.ok && (await response.text()).includes("webSocketDebuggerUrl");
  } catch {
    return false;
  }
}

export function browserLaunchAllowed(env = process.env) {
  return env[BROWSER_AUTOMATION_ENV] === "1"
    || BROWSER_AUTOMATION_ALIASES.some((name) => env[name] === "1");
}

export function browserLaunchOptInMessage() {
  return `Browser automation is disabled by default. Set ${BROWSER_AUTOMATION_ENV}=1 before running Chrome/CDP smoke tests.`;
}

export async function waitForDebuggerUrl(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Chrome DevTools did not become ready: ${lastError?.message || "timeout"}`);
}

export async function createCdpPage(port, url = "about:blank") {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      let response = await fetch(endpoint, { method: "PUT" });
      if (!response.ok && [405, 404].includes(response.status)) {
        response = await fetch(endpoint);
      }
      if (response.ok) {
        const page = await response.json();
        if (!page.webSocketDebuggerUrl || !page.id) throw new Error("Created CDP page did not expose debugger metadata");
        return { id: page.id, webSocketDebuggerUrl: page.webSocketDebuggerUrl };
      }
      lastError = new Error(`Could not create CDP page: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw lastError ?? new Error("Could not create CDP page before timeout");
}

export async function closeCdpPage(port, targetId) {
  if (!targetId) return;
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`, { method: "PUT" });
  } catch {
    /* page cleanup is best-effort; process cleanup still owns browser lifetime */
  }
}

export async function startCdpBrowser({
  port,
  reuseOnly = false,
  profilePrefix = "magnet-marbles-chrome-",
  windowSize = "390,844",
} = {}) {
  if (!browserLaunchAllowed()) {
    throw new Error(browserLaunchOptInMessage());
  }
  if (await cdpReady(port)) {
    return { chrome: "reused", launched: false, port };
  }
  if (reuseOnly) {
    return { chrome: "reused", launched: false, port };
  }

  const chrome = await findBrowser();
  const profileDir = await mkdtemp(join(tmpdir(), profilePrefix));
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--enable-webgl",
    "--mute-audio",
    `--window-size=${windowSize}`,
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  return { chrome, launched: true, child, profileDir, port };
}

export async function stopCdpBrowser(browser) {
  if (!browser?.launched) return;
  const child = browser.child;
  if (child && child.exitCode === null) {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.on("exit", resolve);
        killer.on("error", resolve);
      });
    } else {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(1500),
      ]);
    }
  }

  if (browser.profileDir) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(browser.profileDir, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt === 4) {
          console.warn(`Warning: could not remove temp Chrome profile ${browser.profileDir}: ${error.message}`);
          return;
        }
        await delay(250);
      }
    }
  }
}
