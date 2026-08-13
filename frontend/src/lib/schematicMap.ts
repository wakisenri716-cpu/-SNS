// Projects real lat/lng coordinates onto a 0-100 unit square for
// SchematicRouteMap — not a real map projection (no terrain/streets), but the
// relative layout comes from real coordinates rather than being arbitrary, so
// two points that are actually far apart end up visibly far apart on the
// diagram. Y is flipped so north stays "up", matching how a map normally
// reads.
export function projectLatLngToUnitSquare(
  coords: { lat: number; lng: number }[],
  padding = 12
): { x: number; y: number }[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ x: 50, y: 50 }];

  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;
  const range = 100 - padding * 2;

  return coords.map((c) => ({
    x: padding + ((c.lng - minLng) / lngSpan) * range,
    y: padding + (1 - (c.lat - minLat) / latSpan) * range,
  }));
}
