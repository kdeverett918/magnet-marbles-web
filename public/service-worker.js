const CACHE_PREFIX = "magnet-marbles-shell";
const CACHE_NAME = `${CACHE_PREFIX}-v1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./build.json",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./privacy.html",
  "./support.html",
  "./social-card.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./audio/music.mp3",
  "./audio/sfx/bank.mp3",
  "./audio/sfx/fall.mp3",
  "./audio/sfx/hit.mp3",
  "./audio/sfx/magnet-burst.mp3",
  "./audio/sfx/pickup.mp3",
  "./audio/sfx/shock-pulse.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isDocumentRequest(request, url) {
  return request.mode === "navigate"
    || request.destination === "document"
    || url.pathname === "/"
    || url.pathname.endsWith("/index.html")
    || url.pathname.endsWith("/build.json");
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/audio/")
    || url.pathname.startsWith("/icons/")
    || /\.(css|js|json|mp3|png|svg|webmanifest)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match("./index.html"))
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !sameOrigin(request)) return;

  const url = new URL(request.url);
  if (isDocumentRequest(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
