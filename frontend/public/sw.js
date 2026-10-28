// Jaziba service worker: makes the app installable and keeps the shell
// available offline. Built assets (hashed file names) are cached on first
// use; page loads try the network first and fall back to the cached shell;
// the API and uploaded videos go to the network — except the signed-in
// traveler's しおり, whose last copy is kept so it can be opened offline
// (cleared on logout, see src/lib/offlineItinerary.ts).
const CACHE = "jaziba-v2";
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
          // Only the home page refreshes the offline shell: other pages carry
          // their own link-preview title (see backend lib/pageMeta.ts).
          if (res.ok && url.pathname === "/") {
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

// Web Push (see src/lib/push.ts, backend lib/push.ts): show the お知らせ, and
// open its page when tapped — focusing an open Jaziba window if there is one.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Jaziba", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Jaziba", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    })
  );
});
