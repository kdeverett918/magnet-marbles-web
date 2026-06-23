const REMOVED_MUSIC_PATH = /(?:^|\/)audio\/music\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PLAY_BLOCKER_FLAG = "__magnetMarblesNoMusicPlayBlocker";

type GuardedGlobal = typeof globalThis & {
  __magnetMarblesNoMusicPlayBlocker?: boolean;
};

function urlPath(value: string): string {
  try {
    const base = typeof window === "undefined" ? "https://magnet-marbles.local/" : window.location.href;
    return new URL(value, base).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

export function isRemovedMusicUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return REMOVED_MUSIC_PATH.test(urlPath(value));
}

function mediaSourceUrls(element: HTMLMediaElement): Array<string | null | undefined> {
  return [
    element.currentSrc,
    element.src,
    element.getAttribute("src"),
    ...Array.from(element.querySelectorAll("source")).map((source) => source.getAttribute("src")),
  ];
}

function isRemovedMusicElement(element: HTMLMediaElement): boolean {
  return mediaSourceUrls(element).some(isRemovedMusicUrl);
}

function stopRemovedMusicElement(element: HTMLMediaElement): boolean {
  if (!isRemovedMusicElement(element)) return false;

  element.pause();
  element.removeAttribute("src");
  for (const source of Array.from(element.querySelectorAll("source"))) {
    if (isRemovedMusicUrl(source.getAttribute("src"))) source.removeAttribute("src");
  }
  element.load();
  return true;
}

export function stopRemovedMusicElements(root: ParentNode = document): number {
  const media = Array.from(root.querySelectorAll("audio, video")) as HTMLMediaElement[];
  let stopped = 0;

  for (const element of media) {
    if (stopRemovedMusicElement(element)) stopped += 1;
  }

  return stopped;
}

export async function purgeRemovedMusicCaches(cacheStorage: CacheStorage | undefined = globalThis.caches): Promise<number> {
  if (!cacheStorage) return 0;
  let purged = 0;
  const names = await cacheStorage.keys();

  await Promise.all(names.map(async (name) => {
    const cache = await cacheStorage.open(name);
    const requests = await cache.keys();
    await Promise.all(requests.map(async (request) => {
      const requestUrl = typeof request === "string" ? request : request.url;
      if (!isRemovedMusicUrl(requestUrl)) return;
      if (await cache.delete(request)) purged += 1;
    }));
  }));

  return purged;
}

export function installRemovedMusicPlayBlocker(): boolean {
  const guardedGlobal = globalThis as GuardedGlobal;
  if (guardedGlobal[PLAY_BLOCKER_FLAG]) return false;
  if (typeof HTMLMediaElement === "undefined") return false;

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function guardedPlay(this: HTMLMediaElement) {
    if (stopRemovedMusicElement(this)) return Promise.resolve();
    return originalPlay.call(this);
  };
  guardedGlobal[PLAY_BLOCKER_FLAG] = true;
  return true;
}

export function installNoMusicGuard() {
  const patchedPlay = installRemovedMusicPlayBlocker();
  if (typeof document !== "undefined") stopRemovedMusicElements();
  void purgeRemovedMusicCaches();
  return { patchedPlay };
}
