// The service worker keeps the last しおり response for offline use
// (public/sw.js). It belongs to whoever was signed in, so drop it on logout.
export function clearOfflineItinerary() {
  if ("caches" in window) void caches.delete("jaziba-itinerary").catch(() => {});
}
