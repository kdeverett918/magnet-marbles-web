import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closeCdpPage, createCdpPage, DEFAULT_CDP_PORT, delay, startCdpBrowser, stopCdpBrowser } from "./lib/cdp-browser.mjs";

const DEFAULT_URL = "http://127.0.0.1:5173/";
const URL_TO_TEST = process.env.A11Y_URL || DEFAULT_URL;
const PORT = Number(process.env.MM_CDP_PORT || process.env.A11Y_CDP_PORT || DEFAULT_CDP_PORT);
const REUSE_CDP = process.env.MM_REUSE_CDP === "1" || process.env.A11Y_REUSE_CDP === "1";
const OUTPUT = process.env.A11Y_OUTPUT || "outputs/a11y-smoke.json";

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

async function evaluate(client, expression, awaitPromise = true, timeoutMs = 15_000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Runtime evaluation timed out")), timeoutMs);
  });
  const result = await Promise.race([client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  }), timeout]);
  clearTimeout(timer);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function waitFor(client, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await evaluate(client, expression);
    if (result) return result;
    await delay(100);
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds`);
}

async function pressKey(client, key, code = key, windowsVirtualKeyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function tab(client) {
  await pressKey(client, "Tab", "Tab", 9);
  await delay(40);
}

async function space(client) {
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await client.send("Input.dispatchKeyEvent", { type: "char", text: " ", unmodifiedText: " " });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await delay(80);
}

async function activeElement(client) {
  return evaluate(client, `(() => {
    const el = document.activeElement;
    if (!el) return null;
    const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
    return {
      tag: el.tagName.toLowerCase(),
      text,
      ariaLabel: el.getAttribute("aria-label"),
      ariaPressed: el.getAttribute("aria-pressed"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      disabled: Boolean(el.disabled),
      className: typeof el.className === "string" ? el.className : "",
    };
  })()`);
}

function accessibleName(item) {
  return `${item?.ariaLabel || ""} ${item?.text || ""}`.toLowerCase();
}

async function focusByKeyboard(client, matcher, maxTabs = 24) {
  const seen = [];
  for (let i = 0; i < maxTabs; i++) {
    await tab(client);
    const active = await activeElement(client);
    seen.push(active);
    const focusableControl = active && active.tag !== "body" && active.tag !== "html";
    if (focusableControl && matcher(accessibleName(active), active)) {
      return { active, seen };
    }
  }
  throw new Error(`Could not reach expected control by keyboard. Seen: ${seen.map((item) => item?.ariaLabel || item?.text || item?.tag).join(" | ")}`);
}

async function run() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket. Use Node 22+ for accessibility smoke.");
  }

  const browser = await startCdpBrowser({
    port: PORT,
    reuseOnly: REUSE_CDP,
    profilePrefix: "magnet-marbles-a11y-",
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
    await client.send("Input.setIgnoreInputEvents", { ignore: false });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: URL_TO_TEST });
    await loadEvent;

    await evaluate(client, `localStorage.setItem("magnet-marbles:settings:v1", JSON.stringify({ sound: false, quality: "lite" }))`);
    await evaluate(client, `document.body.focus()`);

    const menu = await evaluate(client, `(() => {
      const inputHelp = document.querySelector("#input-help");
      const inputHelpStyle = inputHelp ? getComputedStyle(inputHelp) : null;
      const buttons = [...document.querySelectorAll("button")].map((button) => ({
        text: (button.textContent || "").replace(/\\s+/g, " ").trim(),
        ariaLabel: button.getAttribute("aria-label"),
        ariaPressed: button.getAttribute("aria-pressed"),
        disabled: button.disabled,
      }));
      return {
        title: document.title,
        hasMenu: Boolean(document.querySelector(".menu")),
        hasMenuFoot: Boolean(document.querySelector(".menu-foot")),
        inputHelpText: inputHelp?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        inputHelpHidden: inputHelpStyle?.position === "absolute" && inputHelpStyle?.width === "1px" && inputHelpStyle?.overflow === "hidden",
        buttons,
      };
    })()`);

    if (!menu.hasMenu) throw new Error("Menu did not render");
    if (menu.hasMenuFoot) throw new Error("Visible shortcut footer returned to the menu");
    if (!menu.inputHelpHidden || !menu.inputHelpText.includes("Keyboard controls")) {
      throw new Error("Screen-reader-only input guidance is missing or visible");
    }

    const playOnlineFocus = await focusByKeyboard(client, (name) => name.includes("play online"));
    const singlePlayerFocus = await focusByKeyboard(client, (name) => name.includes("single player"));
    const focusOrder = [...playOnlineFocus.seen, ...singlePlayerFocus.seen];

    await space(client);
    const gameReady = await waitFor(client, `(() => Boolean(document.querySelector(".hud") && document.querySelector(".controls") && document.querySelector("canvas")))()`, "game view");
    await evaluate(client, `(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.body.tabIndex = -1;
      document.body.focus();
      window.focus();
      return document.activeElement === document.body;
    })()`);

    const keyboardInput = await evaluate(client, `(async () => {
      const controlsUrl = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/game/input/controls.ts")) ?? "/src/game/input/controls.ts";
      const { input } = await import(controlsUrl);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
      const result = { moveZ: input.moveZ, magnet: input.magnet };
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true }));
      return result;
    })()`);

    if (keyboardInput.moveZ >= 0 || keyboardInput.magnet !== true) {
      throw new Error(`Keyboard gameplay input was not reflected in input state: ${JSON.stringify(keyboardInput)}`);
    }

    const touchInput = await evaluate(client, `(async () => {
      const controlsUrl = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/game/input/controls.ts")) ?? "/src/game/input/controls.ts";
      const { input, clearEdges, setTouchMagnetHeld } = await import(controlsUrl);
      const moveHint = document.querySelector(".move-hint");
      const rightZone = document.querySelector(".right-gesture-zone");
      if (!moveHint || !rightZone) throw new Error("Touch gesture affordances missing");
      setTouchMagnetHeld(false);
      clearEdges();

      const emit = (target, type, x, y, id) => {
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          isPrimary: id === 51,
          clientX: x,
          clientY: y,
          buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        }));
      };

      const rightRect = rightZone.getBoundingClientRect();
      const rightX = rightRect.left + rightRect.width * 0.58;
      const rightY = rightRect.bottom - 188;
      emit(rightZone, "pointerdown", rightX, rightY, 52);
      const magnetDuringHold = input.magnet;
      emit(rightZone, "pointerup", rightX + 2, rightY + 2, 52);
      const dashAfterTap = input.dash;
      const magnetAfterRelease = input.magnet;
      clearEdges();

      return {
        moveHint: moveHint.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        magnetDuringHold,
        dashAfterTap,
        magnetAfterRelease,
      };
    })()`);

    if (!touchInput.moveHint.toLowerCase().includes("drag to move")) {
      throw new Error(`Direct-drag movement hint is missing: ${JSON.stringify(touchInput)}`);
    }
    if (touchInput.magnetDuringHold !== true || touchInput.magnetAfterRelease !== false) {
      throw new Error(`Right-side touch hold did not map to magnet input: ${JSON.stringify(touchInput)}`);
    }
    if (touchInput.dashAfterTap !== true) {
      throw new Error(`Right-side touch tap did not trigger dash input: ${JSON.stringify(touchInput)}`);
    }

    const gameControls = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll("button")].map((button) => ({
        text: (button.textContent || "").replace(/\\s+/g, " ").trim(),
        ariaLabel: button.getAttribute("aria-label"),
        ariaPressed: button.getAttribute("aria-pressed"),
        disabled: button.disabled,
      }));
      return {
        hasObjective: Boolean(document.querySelector(".objective-chip")?.textContent?.trim()),
        buttons,
      };
    })()`);

    for (const expected of ["Quit to menu", "Dash", "Hold magnet"]) {
      if (!gameControls.buttons.some((button) => `${button.ariaLabel || ""} ${button.text || ""}`.includes(expected))) {
        throw new Error(`Gameplay control is missing accessible name: ${expected}`);
      }
    }

    await evaluate(client, `(async () => {
      const storeUrl = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/game/store.ts")) ?? "/src/game/store.ts";
      const { getWorld, useGame } = await import(storeUrl);
      const world = getWorld();
      if (!world) throw new Error("World missing");
      world.phase = "matchEnd";
      world.round = world.mode.rounds;
      world.winnerId = world.humanId;
      for (const player of world.players) player.score = player.id === world.humanId ? 12 : player.id;
      useGame.getState().pushHud({
        phase: "matchEnd",
        round: world.round,
        totalRounds: world.mode.rounds,
        roundTime: world.roundTime,
        introCountdown: 0,
        suddenDeath: false,
        winnerId: world.winnerId,
        humanId: world.humanId,
        players: world.players.map((player) => ({
          id: player.id,
          name: player.name,
          colorHex: player.colorHex,
          score: player.score,
          cluster: player.cluster.length,
          isBot: player.isBot,
          alive: player.alive,
        })),
        heldPowerup: null,
        activePowerups: [],
        dashCooldown: 0,
        magnetActive: false,
        clusterCap: 18,
        tutorialAssist: false,
        tutorialStep: "off",
        tutorialGoalPulse: false,
        tutorialComplete: true,
      });
      return true;
    })()`);

    const resultsReady = await waitFor(client, `(() => Boolean([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Play Again")) && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Menu"))))()`, "results overlay");
    const resultsMenuFocus = await focusByKeyboard(client, (name) => name.includes("menu"));
    await space(client);
    await waitFor(client, `(() => Boolean(document.querySelector(".menu")))()`, "menu after results");

    await evaluate(client, `(async () => {
      const storeUrl = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/game/store.ts")) ?? "/src/game/store.ts";
      const { useGame } = await import(storeUrl);
      useGame.setState({
        screen: "menu",
        online: false,
        net: {
          status: "error",
          roomId: "",
          error: "Room not found. Check the code and retry.",
          startedAt: 0,
        },
      });
      return true;
    })()`);

    const retryState = await waitFor(client, `(() => {
      const retry = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("RETRY ONLINE"));
      const status = document.querySelector('[role="status"]');
      return retry && status ? {
        retryText: retry.textContent?.replace(/\\s+/g, " ").trim(),
        statusText: status.textContent?.replace(/\\s+/g, " ").trim(),
        retryDisabled: retry.disabled,
      } : null;
    })()`, "online retry state");

    const retryFocus = await focusByKeyboard(client, (name) => name.includes("retry online"));

    const report = {
      url: URL_TO_TEST,
      chrome,
      pass: true,
      capturedAt: new Date().toISOString(),
      menu: {
        title: menu.title,
        inputHelpHidden: menu.inputHelpHidden,
        focusOrder: focusOrder
          .filter((item) => item && item.tag !== "body" && item.tag !== "html")
          .map((item) => item?.ariaLabel || item?.text || item?.tag),
      },
      game: {
        ready: gameReady,
        keyboardInput,
        touchInput,
        hasObjective: gameControls.hasObjective,
        buttons: gameControls.buttons,
      },
      results: {
        ready: resultsReady,
        menuFocus: resultsMenuFocus.active,
      },
      onlineRetry: {
        state: retryState,
        focus: retryFocus.active,
      },
    };

    await mkdir(join(process.cwd(), "outputs"), { recursive: true });
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

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
