import { mkdir, writeFile } from "node:fs/promises";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, delay, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const DEFAULT_URL = "http://127.0.0.1:4173/";
const URL_TO_TEST = process.env.PREVIEW_URL || DEFAULT_URL;
const PORT = Number(process.env.MM_CDP_PORT || process.env.PREVIEW_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.PREVIEW_REUSE_CDP === "1";
const OUTPUT = process.env.PREVIEW_OUTPUT || "outputs/preview-smoke.json";
const SCREENSHOT = process.env.PREVIEW_SCREENSHOT || "outputs/preview-smoke.png";
const MENU_SCREENSHOT = process.env.PREVIEW_MENU_SCREENSHOT || "outputs/preview-menu.png";
const EXPECT_BUILD_COMMIT = process.env.PREVIEW_EXPECT_BUILD_COMMIT || "";
const VIEWPORT_WIDTH = Number(process.env.PREVIEW_WIDTH || 390);
const VIEWPORT_HEIGHT = Number(process.env.PREVIEW_HEIGHT || 844);
const IS_MOBILE = process.env.PREVIEW_MOBILE ? process.env.PREVIEW_MOBILE !== "false" : VIEWPORT_WIDTH <= 640;

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    const listeners = this.events.get(message.method);
    if (listeners) {
      for (const listener of listeners) listener(message.params);
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listener = (params) => {
        const listeners = this.events.get(method) ?? [];
        this.events.set(method, listeners.filter((item) => item !== listener));
        resolve(params);
      };
      const listeners = this.events.get(method) ?? [];
      listeners.push(listener);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for preview smoke.");
  }

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-preview-",
    windowSize: `${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
  });
  const chrome = browser.chrome;
  let page;
  let client;

  try {
    page = await createCdpPage(PORT);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        try {
          localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({ sound: false, quality: "lite" }));
          localStorage.setItem("magnet-marbles:progression:v1", JSON.stringify({
            stars: 12,
            totalStarsEarned: 20,
            selectedTrail: "gold",
            unlockedTrails: ["comet", "candy", "gold"],
            dailyCompleted: []
          }));
        } catch {}
      })();`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: IS_MOBILE,
    });

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: URL_TO_TEST });
    await loadEvent;

    const boot = await evaluate(client, `(() => {
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const buttons = [...document.querySelectorAll("button")].map((button) => button.textContent?.trim()).filter(Boolean);
      return {
        title: document.title,
        buttons,
        build: window.__MAGNET_MARBLES_BUILD__ ?? null,
        htmlBuild: {
          commit: document.documentElement.dataset.buildCommit ?? "",
          branch: document.documentElement.dataset.buildBranch ?? "",
          dirty: document.documentElement.dataset.buildDirty ?? "",
          builtAt: document.documentElement.dataset.buildTime ?? "",
        },
        hasMenu: Boolean(document.querySelector(".menu")),
        hasDevClient: resources.some((name) => name.includes("/@vite/client")),
        hasSourceModules: resources.some((name) => name.includes("/src/")),
        assetCount: resources.filter((name) => name.includes("/assets/")).length,
        resources: resources.map((name) => new URL(name).pathname).slice(0, 30),
        progression: {
          stars: document.querySelector(".stars-box strong")?.textContent?.trim() ?? "",
          daily: document.querySelector(".daily-button")?.textContent?.trim() ?? "",
          trails: [...document.querySelectorAll(".trail-chip")].map((item) => item.textContent?.trim()).filter(Boolean),
        },
        launchLinks: [...document.querySelectorAll(".launch-links a")].map((link) => {
          const rect = link.getBoundingClientRect();
          return {
            text: link.textContent?.trim() ?? "",
            href: link.getAttribute("href") ?? "",
            visibleInViewport: rect.width > 0 && rect.height > 0 &&
              rect.bottom > 0 && rect.top < window.innerHeight &&
              rect.right > 0 && rect.left < window.innerWidth,
          };
        }),
        modeCards: [...document.querySelectorAll(".modes .mode")].map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            text: button.textContent?.trim() ?? "",
            ariaLabel: button.getAttribute("aria-label") ?? "",
            fullyVisibleInViewport: rect.top >= 0 && rect.left >= 0 &&
              rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          };
        }),
      };
    })()`);

    if (boot.title !== "Magnet Marbles") throw new Error(`Unexpected title: ${boot.title}`);
    if (!boot.hasMenu) throw new Error("Menu did not render from production preview");
    if (!boot.buttons.some((label) => label.includes("SINGLE PLAYER"))) throw new Error("Single Player button missing");
    if (!boot.build?.commit) throw new Error("Build metadata missing from frontend runtime");
    if (EXPECT_BUILD_COMMIT && !String(boot.build.commit).startsWith(EXPECT_BUILD_COMMIT)) {
      throw new Error(`Frontend build commit ${boot.build.commit} did not match expected ${EXPECT_BUILD_COMMIT}`);
    }
    if (boot.hasDevClient || boot.hasSourceModules) throw new Error("Preview loaded Vite dev resources instead of production assets");
    if (boot.assetCount < 2) throw new Error(`Preview did not load production assets. assetCount=${boot.assetCount}`);
    if (!boot.progression?.stars?.includes("12")) throw new Error("Progression stars are missing from menu");
    if (!boot.progression?.daily?.includes("Daily challenge")) throw new Error("Daily challenge entry is missing from menu");
    if (!boot.progression?.trails?.some((label) => label.includes("Gold Rush") && label.includes("Equipped"))) {
      throw new Error("Selected trail skin state is missing from menu");
    }
    for (const expected of ["Privacy", "Support"]) {
      const link = boot.launchLinks?.find((item) => item.text === expected);
      if (!link) throw new Error(`${expected} launch link is missing from menu`);
      if (!link.href.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(`${expected} launch link points at unexpected href: ${link.href}`);
      }
      if (!link.visibleInViewport) throw new Error(`${expected} launch link is not visible in the mobile menu viewport`);
    }
    const expectedModes = ["Classic", "Battle", "King Magnet", "Team Bank", "Survival"];
    for (const expected of expectedModes) {
      const mode = boot.modeCards?.find((item) => `${item.text} ${item.ariaLabel}`.includes(expected));
      if (!mode) throw new Error(`${expected} mode card is missing from menu`);
      if (!mode.fullyVisibleInViewport) throw new Error(`${expected} mode card is clipped in the mobile menu viewport`);
    }

    // The menu has a short cinematic fade-in; wait before capturing visual evidence
    // so screenshot reviews do not race the transient low-opacity frame.
    await delay(650);

    const menuScreenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await mkdir("outputs", { recursive: true });
    await writeFile(MENU_SCREENSHOT, Buffer.from(menuScreenshot.data, "base64"));

    await evaluate(client, `(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("SINGLE PLAYER"));
      if (!button) throw new Error("Single Player button not found");
      button.click();
      return true;
    })()`);

    const gameReady = await evaluate(client, `new Promise((resolve) => {
      const deadline = performance.now() + 10000;
      const check = () => {
        const canvas = document.querySelector("canvas");
        const hud = document.querySelector(".hud");
        const controls = document.querySelector(".controls");
        if (canvas && hud && controls) {
          resolve({
            ready: true,
            canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
            objectiveText: document.querySelector(".objective-chip")?.textContent?.trim() ?? "",
            hudText: document.body.innerText.slice(0, 240),
            touchZones: {
              directDragHint: document.querySelector(".move-hint")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
              rightGesture: Boolean(document.querySelector(".right-gesture-zone")),
              gestureHint: document.querySelector(".gesture-hint")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
            },
            buttonLabels: [...document.querySelectorAll("button")].map((button) => ({
              text: button.textContent?.trim(),
              ariaLabel: button.getAttribute("aria-label"),
              disabled: button.disabled,
            })),
          });
          return;
        }
        if (performance.now() > deadline) {
          resolve({ ready: false, text: document.body.innerText.slice(0, 240) });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })`);

    if (!gameReady.ready) throw new Error(`Game view did not become ready: ${JSON.stringify(gameReady)}`);
    if (gameReady.canvas.width !== VIEWPORT_WIDTH || gameReady.canvas.height !== VIEWPORT_HEIGHT) {
      throw new Error(`Canvas is not mobile-framed: ${JSON.stringify(gameReady.canvas)}`);
    }
    if (!gameReady.objectiveText) throw new Error("Objective chip is missing in gameplay");
    if (!gameReady.touchZones?.directDragHint?.toLowerCase().includes("drag to move") || !gameReady.touchZones?.rightGesture) {
      throw new Error(`Touch gesture zones are missing from gameplay: ${JSON.stringify(gameReady.touchZones)}`);
    }
    if (!gameReady.touchZones?.gestureHint?.toLowerCase().includes("hold magnet")) {
      throw new Error(`Right-side gesture hint is missing expected copy: ${JSON.stringify(gameReady.touchZones)}`);
    }
    for (const expected of ["Quit to menu", "Dash", "Hold magnet"]) {
      if (!gameReady.buttonLabels.some((button) => `${button.ariaLabel || ""} ${button.text || ""}`.includes(expected))) {
        throw new Error(`Gameplay control is missing accessible name: ${expected}`);
      }
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(SCREENSHOT, Buffer.from(screenshot.data, "base64"));

    const report = {
      url: URL_TO_TEST,
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, mobile: IS_MOBILE },
      chrome,
      pass: true,
      capturedAt: new Date().toISOString(),
      screenshot: SCREENSHOT,
      menuScreenshot: MENU_SCREENSHOT,
      boot,
      gameReady,
    };

    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      client?.close();
    } catch {
      /* ignore socket close races */
    }
    await closeCdpPage(PORT, page?.id);
    await stopCdpBrowser(browser);
  }
}

run().catch(async (error) => {
  try {
    await mkdir("outputs", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({
      url: URL_TO_TEST,
      pass: false,
      capturedAt: new Date().toISOString(),
      screenshot: SCREENSHOT,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
  } catch {
    /* ignore report write failures while exiting */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
