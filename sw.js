// Bluewater Intel — offline map tile cache (Service Worker)
const CACHE = "bwi-tiles-v1";
const TILE_HOSTS = [
  "server.arcgisonline.com",
  "tile.openstreetmap.org",
  "tiles.openseamap.org",
];

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isTile = TILE_HOSTS.some((h) => url.hostname.endsWith(h));
  if (!isTile) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch {
      return new Response(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="),
        { headers: { "Content-Type": "image/png" } },
      );
    }
  })());
});

self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "STATS") {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    event.source.postMessage({ type: "STATS_RESULT", count: keys.length });
  } else if (event.data && event.data.type === "CLEAR") {
    await caches.delete(CACHE);
    event.source.postMessage({ type: "CLEAR_DONE" });
  }
});
