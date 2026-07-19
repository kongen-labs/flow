/**
 * Flow local — service worker (offline app shell).
 *
 * Strategy:
 *  - Same-origin GET only. Cross-origin requests (Anthropic, OpenAI, Google,
 *    Mistral, DeepSeek, Kongen API) are NEVER intercepted or cached — vendor
 *    calls always hit the network directly.
 *  - Navigations: network-first, falling back to the cached shell when
 *    offline (the app itself is fully local-first, so a cached shell is a
 *    fully working app).
 *  - Hashed build assets (./assets/*): cache-first — filenames are
 *    content-hashed by Vite, so a cache hit is always correct.
 *  - Other same-origin statics (icons, manifest): cache-first with network
 *    fill.
 *
 * VERSION is stamped at build time: the `__FLOW_BUILD__` placeholder is
 * rewritten in dist/sw.js by the `flow-sw-version` Vite plugin (see
 * vite.config.ts) with the same build id baked into the app bundle as
 * `__APP_BUILD__`. A new deploy → new VERSION → the `activate` handler below
 * purges every prior runtime cache. (In `vite dev` the SW is never registered
 * — main.tsx guards on import.meta.env.PROD — so the raw placeholder is inert.)
 */

const VERSION = "flow-shell-__FLOW_BUILD__";
const SHELL_URLS = ["./", "./manifest.webmanifest", "./icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch cross-origin traffic (LLM vendors, Kongen API).
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so updates land, cache fallback for offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  // Static assets: cache-first, fill from network on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
