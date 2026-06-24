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
    const singlePlayerFocus = await focusByKeyboard(client, (name) => name.includes("single player"), 48);
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
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
      await wait(220);
      const statusText = document.querySelector(".action-status")?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
      const magnetButton = [...document.querySelectorAll("button")]
        .find((button) => ((button.getAttribute("aria-label") || "") + " " + (button.textContent || "")).toLowerCase().includes("magnet"));
      const result = {
        statusText,
        magnetAria: magnetButton?.getAttribute("aria-label") ?? "",
        hudText: document.body.innerText.slice(0, 360),
      };
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true }));
      await wait(80);
      return result;
    })()`);

    if (!keyboardInput.statusText.toLowerCase().replace(/\s+/g, "").includes("magnetpulling")) {
      throw new Error(`Keyboard magnet input was not reflected in visible gameplay status: ${JSON.stringify(keyboardInput)}`);
    }

    const touchInput = await evaluate(client, `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const moveHint = document.querySelector(".move-hint");
      const rightZone = document.querySelector(".right-gesture-zone");
      const magnetButton = document.querySelector("button.act.magnet");
      if (!rightZone || !magnetButton) throw new Error("Touch gesture affordances missing");

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
      await wait(80);
      const duringHold = {
        magnetAria: magnetButton.getAttribute("aria-label"),
        ariaPressed: magnetButton.getAttribute("aria-pressed"),
        rightZoneOn: rightZone.classList.contains("on"),
        statusText: document.querySelector(".action-status")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
      };
      emit(rightZone, "pointerup", rightX + 2, rightY + 2, 52);
      await wait(260);
      const dashButton = document.querySelector("button.act.dash");
      const afterRelease = {
        magnetAria: magnetButton.getAttribute("aria-label"),
        ariaPressed: magnetButton.getAttribute("aria-pressed"),
        rightZoneOn: rightZone.classList.contains("on"),
        dashAria: dashButton?.getAttribute("aria-label") ?? "",
      };

      return {
        moveHint: moveHint?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        duringHold,
        afterRelease,
      };
    })()`);

    if (touchInput.moveHint && !touchInput.moveHint.toLowerCase().includes("drag to move")) {
      throw new Error(`Direct-drag movement hint has unexpected copy: ${JSON.stringify(touchInput)}`);
    }
    if (touchInput.duringHold.ariaPressed !== "true" || !touchInput.duringHold.magnetAria.toLowerCase().includes("pulling")) {
      throw new Error(`Right-side touch hold did not visibly map to magnet input: ${JSON.stringify(touchInput)}`);
    }
    if (touchInput.afterRelease.ariaPressed !== "false" || touchInput.afterRelease.rightZoneOn) {
      throw new Error(`Right-side touch release did not clear magnet affordance: ${JSON.stringify(touchInput)}`);
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

    for (const expected of ["Pause game", "Dash", "Hold magnet"]) {
      if (!gameControls.buttons.some((button) => `${button.ariaLabel || ""} ${button.text || ""}`.includes(expected))) {
        throw new Error(`Gameplay control is missing accessible name: ${expected}`);
      }
    }

    const pauseReady = await evaluate(client, `(() => {
      const pause = [...document.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Pause game");
      if (!pause) throw new Error("Pause game button missing");
      pause.click();
      return true;
    })()`);
    const pauseDialog = await waitFor(client, `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      const buttons = [...document.querySelectorAll("button")].map((button) => ({
        text: (button.textContent || "").replace(/\\s+/g, " ").trim(),
        ariaLabel: button.getAttribute("aria-label"),
        disabled: button.disabled,
      }));
      return dialog && buttons.some((button) => ((button.ariaLabel || "") + " " + (button.text || "")).includes("Resume"))
        && buttons.some((button) => ((button.ariaLabel || "") + " " + (button.text || "")).includes("Restart"))
        && buttons.some((button) => ((button.ariaLabel || "") + " " + (button.text || "")).includes("Menu"))
        ? { title: document.querySelector("#pause-title")?.textContent?.trim() ?? "", buttons }
        : null;
    })()`, "pause dialog");

    const pauseMenuFocus = await focusByKeyboard(client, (name) => name.includes("return to menu") || name === "menu", 18);
    await space(client);
    await waitFor(client, `(() => Boolean(document.querySelector(".menu")))()`, "menu after pause");

    const privateRoom = await evaluate(client, `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const toggle = document.querySelector("button.room-toggle")
        ?? [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Join with code"));
      if (!toggle) throw new Error("Join with code button missing");
      if (toggle.getAttribute("aria-expanded") !== "true") {
        toggle.click();
        const deadline = performance.now() + 2000;
        while (!document.querySelector(".room-input") && performance.now() < deadline) await wait(50);
      }
      const input = document.querySelector(".room-input");
      const playOnline = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("PLAY ONLINE"));
      if (!input || !playOnline) throw new Error("Private room form did not render");
      input.focus();
      input.value = "A11YTEST";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        inputAria: input.getAttribute("aria-label"),
        inputValueLength: input.value.length,
        toggleExpanded: toggle.getAttribute("aria-expanded"),
        playOnlineText: playOnline.textContent?.replace(/\\s+/g, " ").trim(),
        playOnlineDisabled: playOnline.disabled,
      };
    })()`);

    if (privateRoom.inputAria !== "Private room code" || privateRoom.toggleExpanded !== "true") {
      throw new Error(`Private room form is not accessible: ${JSON.stringify(privateRoom)}`);
    }
    if (privateRoom.playOnlineDisabled || !privateRoom.playOnlineText.includes("PLAY ONLINE")) {
      throw new Error(`Play Online button is not available after opening private room form: ${JSON.stringify(privateRoom)}`);
    }

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
      pause: {
        ready: pauseReady,
        dialog: pauseDialog,
        menuFocus: pauseMenuFocus.active,
      },
      privateRoom: {
        state: privateRoom,
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
