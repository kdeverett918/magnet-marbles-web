import vm from "node:vm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUTPUT = process.env.SERVICE_WORKER_OUTPUT || "outputs/service-worker-smoke.json";
const SERVICE_WORKER_PATH = process.env.SERVICE_WORKER_PATH || "public/service-worker.js";
const ORIGIN = "https://magnet-marbles.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function urlKey(requestOrUrl) {
  const raw = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
  return new URL(raw, `${ORIGIN}/`).toString();
}

class FakeCache {
  constructor(fetchLog) {
    this.fetchLog = fetchLog;
    this.entries = new Map();
  }

  async addAll(paths) {
    await Promise.all(paths.map(async (path) => {
      const url = urlKey(path);
      this.fetchLog.push({ kind: "precache", url });
      this.entries.set(url, new Response(`cached:${url}`, {
        status: 200,
        headers: { "x-cache-source": "precache" },
      }));
    }));
  }

  async put(request, response) {
    this.entries.set(urlKey(request), response.clone());
  }

  async match(request) {
    const direct = this.entries.get(urlKey(request));
    if (direct) return direct.clone();
    return undefined;
  }

  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }

  async delete(request) {
    return this.entries.delete(urlKey(request));
  }
}

class FakeCaches {
  constructor(fetchLog) {
    this.fetchLog = fetchLog;
    this.caches = new Map();
  }

  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this.fetchLog));
    return this.caches.get(name);
  }

  async keys() {
    return [...this.caches.keys()];
  }

  async delete(name) {
    return this.caches.delete(name);
  }
}

function request(path, options = {}) {
  return {
    url: new URL(path, `${ORIGIN}/`).toString(),
    method: options.method || "GET",
    mode: options.mode || "same-origin",
    destination: options.destination || "",
  };
}

async function dispatchLifecycle(listener, label) {
  const waits = [];
  listener({
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    },
  });
  assert(waits.length > 0, `${label} did not call waitUntil`);
  await Promise.all(waits);
}

async function dispatchFetch(listener, requestObject) {
  let responsePromise = null;
  listener({
    request: requestObject,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    },
  });
  return responsePromise ? responsePromise : null;
}

async function run() {
  const source = await readFile(SERVICE_WORKER_PATH, "utf8");
  const fetchLog = [];
  const listeners = {};
  let failNetworkFor = new Set();
  const fakeCaches = new FakeCaches(fetchLog);
  const self = {
    location: new URL(`${ORIGIN}/`),
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    skipWaitingCalled: false,
    skipWaiting() {
      self.skipWaitingCalled = true;
    },
    clients: {
      claimCalled: false,
      claim() {
        self.clients.claimCalled = true;
      },
    },
  };

  const context = vm.createContext({
    self,
    caches: fakeCaches,
    fetch: async (req) => {
      const url = urlKey(req);
      fetchLog.push({ kind: "runtime", url });
      if (failNetworkFor.has(url)) throw new Error(`simulated network failure for ${url}`);
      return new Response(`network:${url}`, {
        status: 200,
        headers: { "x-cache-source": "network" },
      });
    },
    Response,
    URL,
    Promise,
    Set,
  });

  vm.runInContext(source, context, { filename: SERVICE_WORKER_PATH });
  assert(typeof listeners.install === "function", "install listener is missing");
  assert(typeof listeners.activate === "function", "activate listener is missing");
  assert(typeof listeners.fetch === "function", "fetch listener is missing");

  await dispatchLifecycle(listeners.install, "install");
  assert(self.skipWaitingCalled, "install should call skipWaiting");
  const cacheNamesAfterInstall = await fakeCaches.keys();
  assert(cacheNamesAfterInstall.length === 1, `expected one cache after install, got ${cacheNamesAfterInstall.join(", ")}`);
  const activeCacheName = cacheNamesAfterInstall[0];
  const activeCache = await fakeCaches.open(activeCacheName);
  const precacheUrls = (await activeCache.keys()).map((item) => item.url).sort();
  assert(precacheUrls.includes(`${ORIGIN}/index.html`), "index.html is not precached");
  assert(precacheUrls.includes(`${ORIGIN}/audio/sfx/pickup.mp3`), "pickup SFX is not precached");
  assert(!precacheUrls.includes(`${ORIGIN}/audio/music.mp3`), "removed background music must not be precached");

  const oldCache = await fakeCaches.open("magnet-marbles-shell-old");
  await oldCache.put(`${ORIGIN}/audio/music.mp3`, new Response("old loud music", { status: 200 }));
  await oldCache.put(`${ORIGIN}/audio/sfx/pickup.mp3`, new Response("old pickup", { status: 200 }));
  await dispatchLifecycle(listeners.activate, "activate");
  assert(self.clients.claimCalled, "activate should claim clients");
  assert(!(await fakeCaches.keys()).includes("magnet-marbles-shell-old"), "activate should delete stale shell caches");

  const musicResponse = await dispatchFetch(listeners.fetch, request("/audio/music.mp3", { destination: "audio" }));
  assert(musicResponse, "removed music fetch should be handled");
  assert(musicResponse.status === 410, `removed music should return 410, got ${musicResponse.status}`);
  assert(musicResponse.headers.get("cache-control") === "no-store", "removed music response should be no-store");

  const buildRequest = request("/build.json", { destination: "document" });
  const buildNetwork = await dispatchFetch(listeners.fetch, buildRequest);
  assert(buildNetwork.status === 200, "build.json network response should succeed");
  assert((await buildNetwork.text()).startsWith("network:"), "build.json should use network-first response");
  failNetworkFor = new Set([buildRequest.url]);
  const buildFallback = await dispatchFetch(listeners.fetch, buildRequest);
  assert(buildFallback.status === 200, "build.json fallback should succeed from cache");
  assert((await buildFallback.text()).startsWith("network:"), "build.json fallback should use previously cached network response");

  const indexRequest = request("/index.html", { destination: "document" });
  failNetworkFor = new Set([indexRequest.url]);
  const indexFallback = await dispatchFetch(listeners.fetch, indexRequest);
  assert(indexFallback.status === 200, "index.html fallback should succeed from app shell");
  assert((await indexFallback.text()).startsWith("cached:"), "index.html fallback should use precached app shell");

  failNetworkFor = new Set();
  const sfxRequest = request("/audio/sfx/pickup.mp3", { destination: "audio" });
  const sfxResponse = await dispatchFetch(listeners.fetch, sfxRequest);
  assert(sfxResponse.status === 200, "SFX cache-first response should succeed");
  assert((await sfxResponse.text()).startsWith("cached:"), "SFX should be served cache-first from precache");

  const jsRequest = request("/assets/game.js", { destination: "script" });
  const jsResponse = await dispatchFetch(listeners.fetch, jsRequest);
  assert(jsResponse.status === 200, "first JS asset fetch should succeed");
  assert((await jsResponse.text()).startsWith("network:"), "uncached JS should fetch from network");
  failNetworkFor = new Set([jsRequest.url]);
  const jsCached = await dispatchFetch(listeners.fetch, jsRequest);
  assert(jsCached.status === 200, "cached JS should survive network failure");
  assert((await jsCached.text()).startsWith("network:"), "cached JS should reuse network response");

  const crossOrigin = await dispatchFetch(listeners.fetch, {
    url: "https://magnet-marbles-server.onrender.com/health",
    method: "GET",
    mode: "cors",
    destination: "",
  });
  assert(crossOrigin === null, "cross-origin backend requests must not be intercepted");

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    serviceWorker: SERVICE_WORKER_PATH,
    cacheName: activeCacheName,
    precachedCount: precacheUrls.length,
    checks: [
      "install precaches app shell/SFX",
      "removed music is not precached",
      "activate deletes stale shell caches",
      "removed music returns 410 no-store",
      "build.json uses network-first cache fallback",
      "index.html falls back to app shell",
      "static audio/assets use cache-first",
      "cross-origin backend requests are ignored",
    ],
    fetchLog,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
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
  process.exit(1);
});
