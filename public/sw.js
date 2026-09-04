self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-only fetch handler: keeps the app installable without
// serving stale content from a cache.
self.addEventListener("fetch", () => {});
