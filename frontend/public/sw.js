// Jaziba service worker: makes the app installable and keeps the shell
// available offline. Built assets (hashed file names) are cached on first
// use; page loads try the network first and fall back to the cached shell;
// the API and uploaded videos go to the network — except the signed-in
// traveler's trips and each trip's しおり, whose last copies are kept so they
// can be opened offline (cleared on logout, see src/lib/offlineItinerary.ts).
const CACHE = "jaziba-v5";
const ITINERARY_CACHE = "jaziba-itinerary";
// What another app shared to Jaziba (manifest share_target), picked up by /share.
const SHARE_CACHE = "jaziba-share";
// GET /api/me/trips and GET /api/me/trips/:id/itinerary
const OFFLINE_API = /^\/api\/me\/trips(\/[^/]+\/itinerary)?$/;
const SHELL = ["/", "/manifest.webmanifest", "/brand/jaziba-logo-light.svg", "/brand/jaziba-logo-dark.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ITINERARY_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // 共有で受け取る: a photo, link or text shared from another app arrives as
  // a form POST; keep it on the device for the /share page and go there.
  if (req.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (OFFLINE_API.test(url.pathname) && !url.search) {
    const key = url.pathname;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ITINERARY_CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(key, { cacheName: ITINERARY_CACHE });
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

async function receiveShare(req) {
  try {
    const form = await req.formData();
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete("/shared/photo");
    const photo = form.get("photo");
    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto) await cache.put("/shared/photo", new Response(photo, { headers: { "Content-Type": photo.type || "image/jpeg" } }));
    const meta = { title: form.get("title") || "", text: form.get("text") || "", url: form.get("url") || "", hasPhoto, at: Date.now() };
    await cache.put("/shared/meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // The page says nothing arrived.
  }
  return Response.redirect("/share", 303);
}

// Web Push (see src/lib/push.ts, backend lib/push.ts): show the お知らせ, and
// open its page when tapped — focusing an open Jaziba window if there is one.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Jaziba", body: event.data ? event.data.text() : "" };
  }
  // A dot on the home-screen icon until the app is opened (Badging API).
  self.navigator.setAppBadge?.().catch(() => {});
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
    self.clients.matchAll({ type: "window" }).then(async (windows) => {
      // navigate() only works on windows this worker controls (hence no
      // includeUncontrolled); if it fails anyway, open a new window.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          const navigated = await open.navigate(url);
          return (navigated || open).focus();
        } catch {
          // fall through
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
