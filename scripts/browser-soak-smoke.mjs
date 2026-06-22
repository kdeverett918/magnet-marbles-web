import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const DEFAULT_URL = "http://127.0.0.1:4173/";
const URL_TO_TEST = process.env.SOAK_URL || process.env.PREVIEW_URL || DEFAULT_URL;
const PORT = Number(process.env.MM_CDP_PORT || process.env.SOAK_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.SOAK_REUSE_CDP === "1";
const SAMPLE_MS = Number(process.env.SOAK_SAMPLE_MS || 15_000);
const OUTPUT = process.env.SOAK_OUTPUT || "outputs/browser-soak-smoke.json";
const MAX_P95_FRAME_MS = Number(process.env.SOAK_MAX_P95_FRAME_MS || 33.4);
const MAX_DROPPED_FRAMES = Number(process.env.SOAK_MAX_DROPPED_FRAMES || 25);
const MAX_CONSOLE_ERRORS = Number(process.env.SOAK_MAX_CONSOLE_ERRORS || 0);

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function summarizeFrames(deltas) {
  const dropped = deltas.filter((dt) => dt > 33.4).length;
  const avgDelta = deltas.reduce((sum, dt) => sum + dt, 0) / Math.max(1, deltas.length);
  return {
    frames: deltas.length,
    avgFps: Number((1000 / avgDelta).toFixed(1)),
    avgFrameMs: Number(avgDelta.toFixed(2)),
    p95FrameMs: Number(percentile(deltas, 0.95).toFixed(2)),
    p99FrameMs: Number(percentile(deltas, 0.99).toFixed(2)),
    maxFrameMs: Number(Math.max(...deltas).toFixed(2)),
    droppedFramesOver33ms: dropped,
  };
}

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

  on(method, listener) {
    const listeners = this.events.get(method) ?? [];
    listeners.push(listener);
    this.events.set(method, listeners);
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
      this.on(method, listener);
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
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for browser soak smoke.");
  }

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-soak-",
    windowSize: "390,844",
  });
  const chrome = browser.chrome;
  const errors = [];
  const warnings = [];
  let page;
  let client;

  try {
    page = await createCdpPage(PORT);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        try {
          localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({ sound: false, quality: "lite" }));
          localStorage.setItem("magnet-marbles:tutorial-complete:v1", "1");
        } catch {
          /* storage can be unavailable */
        }
      `,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    client.on("Runtime.exceptionThrown", (event) => {
      errors.push({
        source: "Runtime.exceptionThrown",
        text: event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "runtime exception",
      });
    });
    client.on("Runtime.consoleAPICalled", (event) => {
      const text = (event.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ").slice(0, 500);
      if (event.type === "error" || event.type === "assert") errors.push({ source: "console", text });
      if (event.type === "warning") warnings.push({ source: "console", text });
    });
    client.on("Log.entryAdded", (event) => {
      const entry = event.entry || {};
      const item = { source: entry.source || "log", text: String(entry.text || "").slice(0, 500), level: entry.level };
      if (entry.level === "error") errors.push(item);
      if (entry.level === "warning") warnings.push(item);
    });

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: URL_TO_TEST });
    await loadEvent;

    const boot = await evaluate(client, `(() => {
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const play = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("SINGLE PLAYER"));
      return {
        title: document.title,
        hasMenu: Boolean(document.querySelector(".menu")),
        hasPlay: Boolean(play),
        build: window.__MAGNET_MARBLES_BUILD__ ?? null,
        hasDevClient: resources.some((name) => name.includes("/@vite/client")),
        hasSourceModules: resources.some((name) => name.includes("/src/")),
        assetCount: resources.filter((name) => name.includes("/assets/")).length,
      };
    })()`);

    if (boot.title !== "Magnet Marbles") throw new Error(`Unexpected title: ${boot.title}`);
    if (!boot.hasMenu || !boot.hasPlay) throw new Error(`Menu did not expose Single Player: ${JSON.stringify(boot)}`);
    if (boot.hasDevClient || boot.hasSourceModules) throw new Error("Soak loaded Vite dev resources instead of production assets");

    await evaluate(client, `(() => {
      const play = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("SINGLE PLAYER"));
      if (!play) throw new Error("Single Player button not found");
      play.click();
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
            hudText: document.body.innerText.slice(0, 260),
          });
          return;
        }
        if (performance.now() > deadline) {
          resolve({ ready: false, text: document.body.innerText.slice(0, 260) });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })`);

    if (!gameReady.ready) throw new Error(`Game view did not become ready: ${JSON.stringify(gameReady)}`);

    const soak = await evaluate(client, `new Promise((resolve) => {
      const sampleMs = ${SAMPLE_MS};
      const deltas = [];
      const snapshots = [];
      const keys = new Set();
      const keyDown = (code, key = "") => {
        if (keys.has(code)) return;
        keys.add(code);
        window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true }));
      };
      const keyUp = (code, key = "") => {
        if (!keys.has(code)) return;
        keys.delete(code);
        window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true, cancelable: true }));
      };
      const tap = (code, key = "") => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true, cancelable: true }));
      };
      const releaseAll = () => {
        for (const code of [...keys]) keyUp(code, code === "Space" ? " " : "");
      };

      const startedAt = performance.now();
      let last = startedAt;
      let lastPattern = -1;
      let lastSnapshot = startedAt;
      let lastDash = startedAt;
      let lastPower = startedAt;

      function frame(now) {
        deltas.push(now - last);
        last = now;
        const elapsed = now - startedAt;
        const pattern = Math.floor(elapsed / 1500) % 4;
        if (pattern !== lastPattern) {
          releaseAll();
          lastPattern = pattern;
          if (pattern === 0) keyDown("KeyW", "w");
          if (pattern === 1) keyDown("KeyD", "d");
          if (pattern === 2) keyDown("KeyS", "s");
          if (pattern === 3) keyDown("KeyA", "a");
        }
        if (Math.floor(elapsed / 1100) % 2 === 0) keyDown("Space", " ");
        else keyUp("Space", " ");
        if (now - lastDash > 1800) {
          tap("ShiftLeft", "Shift");
          lastDash = now;
        }
        if (now - lastPower > 3600) {
          tap("KeyE", "e");
          lastPower = now;
        }
        if (now - lastSnapshot > 2500) {
          const canvas = document.querySelector("canvas");
          const hud = document.querySelector(".hud");
          snapshots.push({
            elapsedMs: Math.round(elapsed),
            canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
            hud: Boolean(hud),
            objectiveText: document.querySelector(".objective-chip")?.textContent?.trim() ?? "",
            bodyText: document.body.innerText.slice(0, 220),
          });
          lastSnapshot = now;
        }
        if (elapsed >= sampleMs) {
          releaseAll();
          const canvas = document.querySelector("canvas");
          resolve({
            deltas: deltas.slice(1),
            snapshots,
            final: {
              canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
              hasHud: Boolean(document.querySelector(".hud")),
              hasControls: Boolean(document.querySelector(".controls")),
              objectiveText: document.querySelector(".objective-chip")?.textContent?.trim() ?? "",
              bodyText: document.body.innerText.slice(0, 320),
              activeElement: document.activeElement?.tagName ?? "",
            },
          });
          return;
        }
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    })`, true);

    const metrics = await evaluate(client, `(() => ({
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null,
      resourceCount: performance.getEntriesByType("resource").length,
      domNodes: document.querySelectorAll("*").length,
      canvasCount: document.querySelectorAll("canvas").length,
    }))()`);

    const frameStats = summarizeFrames(soak.deltas);
    const canvasOk = soak.final.canvas?.width === 390 && soak.final.canvas?.height === 844;
    const pageAlive = canvasOk && soak.final.hasHud && soak.final.hasControls && Boolean(soak.final.objectiveText);
    const pass = pageAlive &&
      frameStats.p95FrameMs <= MAX_P95_FRAME_MS &&
      frameStats.droppedFramesOver33ms <= MAX_DROPPED_FRAMES &&
      errors.length <= MAX_CONSOLE_ERRORS;

    const report = {
      url: URL_TO_TEST,
      chrome,
      sampleMs: SAMPLE_MS,
      thresholds: {
        maxP95FrameMs: MAX_P95_FRAME_MS,
        maxDroppedFramesOver33ms: MAX_DROPPED_FRAMES,
        maxConsoleErrors: MAX_CONSOLE_ERRORS,
      },
      pass,
      capturedAt: new Date().toISOString(),
      boot,
      gameReady,
      pageAlive,
      final: soak.final,
      snapshots: soak.snapshots,
      frameStats,
      metrics,
      console: {
        errors: errors.slice(0, 20),
        warnings: warnings.slice(0, 20),
      },
    };

    await mkdir(join(process.cwd(), "outputs"), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!pass) {
      throw new Error(`Browser soak failed: pageAlive=${pageAlive} p95=${frameStats.p95FrameMs}ms dropped=${frameStats.droppedFramesOver33ms} errors=${errors.length}`);
    }
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

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
