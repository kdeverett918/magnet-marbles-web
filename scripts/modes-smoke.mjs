import { mkdir, writeFile } from "node:fs/promises";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const DEFAULT_URL = "http://127.0.0.1:4173/";
const URL_TO_TEST = process.env.MODES_URL || process.env.PREVIEW_URL || DEFAULT_URL;
const PORT = Number(process.env.MM_CDP_PORT || process.env.MODES_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.MODES_REUSE_CDP === "1";
const OUTPUT = process.env.MODES_OUTPUT || "outputs/modes-smoke.json";
const SCREENSHOT_DIR = process.env.MODES_SCREENSHOT_DIR || "outputs/modes-smoke";

const modes = [
  { id: "classic", name: "Classic", objective: "collect candy marbles" },
  { id: "battle", name: "Battle", objective: "dash into loaded rivals" },
  { id: "king-magnet", name: "King Magnet", objective: "carry the largest cluster" },
  { id: "team-bank", name: "Team Bank", objective: "bank at either team goal", hudIncludes: ["T1", "T2"] },
  { id: "survival", name: "Survival", objective: "stay on the table", hudIncludes: ["3L"] },
];

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

function runUrl(modeId) {
  const url = new URL(URL_TO_TEST);
  url.searchParams.set("modeSmoke", modeId);
  return url.toString();
}

async function navigate(client, url) {
  const loadEvent = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loadEvent;
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for modes smoke.");
  }

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-modes-",
    windowSize: "390,844",
  });
  let page;
  let client;

  const report = {
    url: URL_TO_TEST,
    chrome: browser.chrome,
    pass: false,
    capturedAt: new Date().toISOString(),
    modes: [],
  };

  try {
    page = await createCdpPage(PORT);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    await mkdir(SCREENSHOT_DIR, { recursive: true });

    for (const mode of modes) {
      await navigate(client, runUrl(mode.id));

      const boot = await evaluate(client, `(() => {
        const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
        return {
          title: document.title,
          hasMenu: Boolean(document.querySelector(".menu")),
          hasMode: [...document.querySelectorAll("button")].some((button) => {
            const label = button.getAttribute("aria-label") || button.textContent || "";
            return label.trim().startsWith(${JSON.stringify(mode.name)});
          }),
          hasDevClient: resources.some((name) => name.includes("/@vite/client")),
          hasSourceModules: resources.some((name) => name.includes("/src/")),
          assetCount: resources.filter((name) => name.includes("/assets/")).length,
        };
      })()`);

      if (boot.title !== "Magnet Marbles") throw new Error(`${mode.name}: unexpected title ${boot.title}`);
      if (!boot.hasMenu) throw new Error(`${mode.name}: menu missing`);
      if (!boot.hasMode) throw new Error(`${mode.name}: mode button missing`);
      if (boot.hasDevClient || boot.hasSourceModules) throw new Error(`${mode.name}: loaded Vite dev resources`);
      if (boot.assetCount < 2) throw new Error(`${mode.name}: production assets missing`);

      await evaluate(client, `new Promise((resolve, reject) => {
        localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({ sound: false, quality: "lite" }));
        localStorage.setItem("magnet-marbles:tutorial-complete:v1", "1");
        const modeButton = [...document.querySelectorAll("button")].find((button) => {
          const label = button.getAttribute("aria-label") || button.textContent || "";
          return label.trim().startsWith(${JSON.stringify(mode.name)});
        });
        if (!modeButton) {
          reject(new Error("mode button not found"));
          return;
        }
        modeButton.click();
        const deadline = performance.now() + 2000;
        const check = () => {
          if (modeButton.classList.contains("active") || modeButton.getAttribute("aria-pressed") === "true") {
            const play = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("SINGLE PLAYER"));
            if (!play) {
              reject(new Error("single player button not found"));
              return;
            }
            play.click();
            resolve(true);
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error("mode selection did not become active"));
            return;
          }
          setTimeout(check, 50);
        };
        check();
      })`);

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
              hudText: document.body.innerText.slice(0, 320),
              buttonLabels: [...document.querySelectorAll("button")].map((button) => ({
                text: button.textContent?.trim(),
                ariaLabel: button.getAttribute("aria-label"),
                disabled: button.disabled,
              })),
            });
            return;
          }
          if (performance.now() > deadline) {
            resolve({ ready: false, text: document.body.innerText.slice(0, 320) });
            return;
          }
          setTimeout(check, 100);
        };
        check();
      })`);

      if (!gameReady.ready) throw new Error(`${mode.name}: game view did not become ready: ${JSON.stringify(gameReady)}`);
      if (gameReady.canvas.width !== 390 || gameReady.canvas.height !== 844) {
        throw new Error(`${mode.name}: canvas is not mobile-framed: ${JSON.stringify(gameReady.canvas)}`);
      }
      if (!gameReady.objectiveText.toLowerCase().includes(mode.objective)) {
        throw new Error(`${mode.name}: objective missing '${mode.objective}'. Saw '${gameReady.objectiveText}'`);
      }
      for (const expected of mode.hudIncludes ?? []) {
        if (!gameReady.hudText.includes(expected)) throw new Error(`${mode.name}: HUD missing '${expected}'`);
      }
      for (const expected of ["Quit to menu", "Dash", "Hold magnet"]) {
        if (!gameReady.buttonLabels.some((button) => `${button.ariaLabel || ""} ${button.text || ""}`.includes(expected))) {
          throw new Error(`${mode.name}: gameplay control missing accessible name: ${expected}`);
        }
      }

      const screenshotPath = `${SCREENSHOT_DIR}/${mode.id}.png`;
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

      report.modes.push({
        id: mode.id,
        name: mode.name,
        pass: true,
        screenshot: screenshotPath,
        boot,
        gameReady,
      });
    }

    report.pass = true;
    await mkdir("outputs", { recursive: true });
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
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
  } catch {
    /* ignore report write failures while exiting */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
