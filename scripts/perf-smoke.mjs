import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const DEFAULT_URL = "http://127.0.0.1:5173/";
const URL_TO_TEST = process.env.PERF_URL || DEFAULT_URL;
const PORT = Number(process.env.MM_CDP_PORT || process.env.PERF_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.PERF_REUSE_CDP === "1";
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS || 5000);
const OUTPUT = process.env.PERF_OUTPUT || "outputs/perf-smoke.json";
const MAX_P95_FRAME_MS = Number(process.env.PERF_MAX_P95_FRAME_MS || 33.4);
const MAX_DROPPED_FRAMES = Number(process.env.PERF_MAX_DROPPED_FRAMES || 5);

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
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for perf smoke.");
  }

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-perf-",
    windowSize: "390,844",
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
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: URL_TO_TEST });
    await loadEvent;

    const boot = await evaluate(client, `(() => {
      const canvas = document.querySelector("canvas");
      return {
        title: document.title,
        buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean),
        canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
        navEntry: performance.getEntriesByType("navigation")[0]?.toJSON?.() ?? null,
      };
    })()`);

    await evaluate(client, `(() => {
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("SINGLE PLAYER"));
      if (!button) throw new Error("Single Player button not found");
      button.click();
      return true;
    })()`);

    const gameReady = await evaluate(client, `new Promise((resolve) => {
      const deadline = performance.now() + 10000;
      const check = () => {
        const canvas = document.querySelector("canvas");
        const hud = document.querySelector(".hud");
        if (canvas && hud) {
          resolve({
            ready: true,
            canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
            hudText: document.body.innerText.slice(0, 240),
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

    await evaluate(client, `localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({ sound: false, quality: "high" }))`);

    const deltas = await evaluate(client, `new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      let start = last;
      function frame(now) {
        deltas.push(now - last);
        last = now;
        if (now - start >= ${SAMPLE_MS}) resolve(deltas.slice(1));
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })`);

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

    const frameStats = summarizeFrames(deltas);
    const pass = frameStats.p95FrameMs <= MAX_P95_FRAME_MS && frameStats.droppedFramesOver33ms <= MAX_DROPPED_FRAMES;
    const report = {
      url: URL_TO_TEST,
      chrome,
      sampleMs: SAMPLE_MS,
      thresholds: {
        maxP95FrameMs: MAX_P95_FRAME_MS,
        maxDroppedFramesOver33ms: MAX_DROPPED_FRAMES,
      },
      pass,
      capturedAt: new Date().toISOString(),
      boot,
      gameReady,
      frameStats,
      metrics,
    };

    await mkdir(join(process.cwd(), "outputs"), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!pass) {
      throw new Error(`Perf smoke failed: p95=${frameStats.p95FrameMs}ms dropped=${frameStats.droppedFramesOver33ms}`);
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
