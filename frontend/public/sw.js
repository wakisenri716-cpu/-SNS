// Jaziba service worker: makes the app installable and keeps the shell
// available offline. Built assets (hashed file names) are cached on first
// use; page loads try the network first and fall back to the cached shell;
// the API and uploaded videos go to the network — except the signed-in
// traveler's しおり, whose last copy is kept so it can be opened offline
// (cleared on logout, see src/lib/offlineItinerary.ts).
const CACHE = "jaziba-v1";
const ITINERARY_CACHE = "jaziba-itinerary";
const ITINERARY_PATH = "/api/reels/itinerary";
const SHELL = ["/", "/manifest.webmanifest", "/brand/jaziba-logo.png", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ITINERARY_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname === ITINERARY_PATH) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ITINERARY_CACHE).then((c) => c.put(ITINERARY_PATH, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(ITINERARY_PATH, { cacheName: ITINERARY_CACHE });
          if (!hit) throw new Error("offline and no saved itinerary");
          // Mark it so the page can say this is the last saved copy.
          const headers = new Headers(hit.headers);
          headers.set("X-Jaziba-Offline", "1");
          return new Response(await hit.blob(), { status: 200, headers });
        })
    );
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
