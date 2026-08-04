/**
 * Hand-written service worker, root scope, no build plugin (design.md §8,
 * Key Decision #13). Shell + static-asset caching ONLY — explicitly NOT
 * wired for offline data sync (proposal: out of scope this cycle).
 *
 * SECURITY-RELEVANT RULE — do not relax this: anything to Supabase,
 * `/auth/**`, Server Actions, or any non-GET request is network-only and
 * NEVER cached. Caching an authenticated response would leak money data
 * into a shared cache and could survive sign-out.
 */

const SHELL_CACHE = "lifeos-shell-v1";
const STATIC_CACHE = "lifeos-static-v1";
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isNeverCache(url, request) {
  if (request.method !== "GET") return true;
  if (url.pathname.startsWith("/auth/")) return true;
  if (url.hostname.endsWith(".supabase.co")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  return false;
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-only, never cached: auth, Supabase, any non-GET (security rule above).
  if (isNeverCache(url, request)) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for content-hashed, immutable static assets.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Network-first for navigations, falling back to the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }
});

// Web-Push readiness scaffolding — deliberately empty. Registering a
// root-scoped SW now is the whole architectural prerequisite; adding push
// later (VAPID keys, a scheduled Supabase function, `core.push_subscriptions`)
// is additive and out of scope for this cycle (design.md §8).
self.addEventListener("push", () => {});
self.addEventListener("notificationclick", () => {});
