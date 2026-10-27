// Great-circle distance in km (haversine).
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

// The browser's current position (asks permission the first time).
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("geolocation unsupported"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      reject,
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  });
}
