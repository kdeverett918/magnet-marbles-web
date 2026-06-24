import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, delay, startCdpBrowser, stopCdpBrowser } from "../scripts/lib/cdp-browser.mjs";

const URL_TO_CAPTURE = process.env.CAPTURE_URL || process.env.PREVIEW_URL || "http://127.0.0.1:4173/";
const PORT = Number(process.env.MM_CDP_PORT || process.env.CAPTURE_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.CAPTURE_REUSE_CDP === "1";
const OUTPUT_DIR = resolve(process.env.CAPTURE_OUTPUT_DIR || "outputs/gameplay-video-review");
const FRAME_DIR = join(OUTPUT_DIR, "frames");
const MP4_PATH = resolve(process.env.CAPTURE_MP4 || join(OUTPUT_DIR, "magnet-marbles-candidate.mp4"));
const WIDTH = Number(process.env.CAPTURE_WIDTH || 390);
const HEIGHT = Number(process.env.CAPTURE_HEIGHT || 844);
const PLAYBACK_FPS = Number(process.env.CAPTURE_PLAYBACK_FPS || 10);
const DURATION_MS = Number(process.env.CAPTURE_DURATION_MS || 12_000);
const FRAME_INTERVAL_MS = 1000 / PLAYBACK_FPS;

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", rejectOpen, { once: true });
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
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  once(method) {
    return new Promise((resolveOnce) => {
      const listener = (params) => {
        const listeners = this.events.get(method) ?? [];
        this.events.set(method, listeners.filter((item) => item !== listener));
        resolveOnce(params);
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

async function waitFor(client, expression, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await evaluate(client, expression);
    if (result) return result;
    await delay(100);
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds`);
}

function runFfmpeg(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function captureFrame(client, index) {
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const file = join(FRAME_DIR, `frame_${String(index).padStart(4, "0")}.png`);
  await writeFile(file, Buffer.from(screenshot.data, "base64"));
  return resolve(file);
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for gameplay capture.");
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(FRAME_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-capture-",
    windowSize: `${WIDTH},${HEIGHT}`,
  });
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
          localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({
            sound: false,
            haptics: false,
            quality: "lite",
            motion: "full"
          }));
          localStorage.setItem("magnet-marbles:tutorial-complete:v1", "1");
        } catch {}
      })();`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: true,
    });

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: URL_TO_CAPTURE });
    await loadEvent;
    await waitFor(client, `(() => Boolean(document.querySelector(".menu") && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("SINGLE PLAYER"))))()`, "menu");

    await evaluate(client, `(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("SINGLE PLAYER"));
      if (!button) throw new Error("Single Player button not found");
      button.click();
      return true;
    })()`);
    await waitFor(client, `(() => Boolean(document.querySelector("canvas") && document.querySelector(".hud") && document.querySelector(".controls")))()`, "game view");
    await delay(500);

    await evaluate(client, `(() => {
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

      window.__MAGNET_CAPTURE_STOP__ = () => {
        window.__MAGNET_CAPTURE_RUNNING__ = false;
        releaseAll();
      };
      if (window.__MAGNET_CAPTURE_RUNNING__) return true;
      window.__MAGNET_CAPTURE_RUNNING__ = true;
      const startedAt = performance.now();
      let lastPattern = -1;
      let lastDash = startedAt;
      let lastPower = startedAt;

      function frame(now) {
        if (!window.__MAGNET_CAPTURE_RUNNING__) {
          releaseAll();
          return;
        }
        const elapsed = now - startedAt;
        const pattern = Math.floor(elapsed / 1250) % 4;
        if (pattern !== lastPattern) {
          releaseAll();
          lastPattern = pattern;
          if (pattern === 0) keyDown("KeyW", "w");
          if (pattern === 1) keyDown("KeyD", "d");
          if (pattern === 2) keyDown("KeyS", "s");
          if (pattern === 3) keyDown("KeyA", "a");
        }
        if (Math.floor(elapsed / 700) % 2 === 0) keyDown("Space", " ");
        else keyUp("Space", " ");
        if (now - lastDash > 1350) {
          tap("ShiftLeft", "Shift");
          lastDash = now;
        }
        if (now - lastPower > 3300) {
          tap("KeyE", "e");
          lastPower = now;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      return true;
    })()`);

    const frames = [];
    const frameCount = Math.ceil(DURATION_MS / FRAME_INTERVAL_MS);
    for (let index = 0; index < frameCount; index++) {
      const startedAt = performance.now();
      frames.push(await captureFrame(client, index + 1));
      const elapsed = performance.now() - startedAt;
      await delay(Math.max(0, FRAME_INTERVAL_MS - elapsed));
    }

    await evaluate(client, `(() => {
      if (typeof window.__MAGNET_CAPTURE_STOP__ === "function") window.__MAGNET_CAPTURE_STOP__();
      return true;
    })()`);

    await runFfmpeg([
      "-y",
      "-framerate", String(PLAYBACK_FPS),
      "-i", join(FRAME_DIR, "frame_%04d.png"),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      MP4_PATH,
    ]);

    const manifest = {
      mp4: MP4_PATH,
      frames: frames.length,
      framesDir: FRAME_DIR,
      playbackFps: PLAYBACK_FPS,
      width: WIDTH,
      height: HEIGHT,
      url: URL_TO_CAPTURE,
    };
    console.log(JSON.stringify(manifest));
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
