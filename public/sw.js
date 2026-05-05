// Glassfin service worker.
//
// Strategy:
//  - Network-first for HTML navigations + the runtime config script. These are
//    the entry points that pin which hashed bundles get loaded; serving stale
//    HTML traps users on old JS forever (which is how `getBackdropUrl is not a
//    function` appeared after a deploy that added the method).
//  - Cache-first for hashed assets under /assets/ (Vite emits content hashes
//    in filenames, so a code change produces a new URL — the cache can never
//    serve stale code there).
//  - Cache-first for the static shell (icon, manifest), with background refresh.
//  - Bypass non-GET and cross-origin requests entirely; we never want to
//    intercept Jellyfin API calls.
//
// CACHE_NAME bump: v1 → v2 forces a clean cache on first activate after deploy,
// which evicts any stale bundles users were stuck on under the old strategy.

const CACHE_NAME = "glassfin-shell-v2";
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/pwa-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isHtmlNav =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html");
  const isRuntimeConfig = url.pathname === "/config.js";

  if (isHtmlNav || isRuntimeConfig) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => cached || caches.match("/")),
    );
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);
  });
}
