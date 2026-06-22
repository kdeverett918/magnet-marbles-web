function isLocalDevelopmentHost() {
  const hostname = window.location.hostname;
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".local");
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (isLocalDevelopmentHost()) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const workerUrl = new URL("service-worker.js", window.location.href).toString();
    void navigator.serviceWorker.register(workerUrl).then((registration) => {
      void registration.update();
    }).catch(() => {
      // Service workers are progressive enhancement; failed registration must not block play.
    });
  }, { once: true });
}
