// Which 楽天トラベル hotel a lodging post is about: the same name (ignoring
// width, spaces, punctuation and words like ホテル/旅館) and close by. Only
// a clear match counts — a wrong hotel would send people to book the wrong place.
const GENERIC = /(ホテル|旅館|温泉|リゾート|ゲストハウス|ペンション|民宿|の宿|hotel|ryokan|inn|resort|guest\s*house)/gi;

export function normalizeHotelName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･\-‐ー－_.,、。'’"“”()（）［］\[\]「」『』&＆]/g, "")
    .replace(GENERIC, "");
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** The hotel among `candidates` the post names, if exactly one fits; else null. */
export function matchHotel<T extends { name: string; lat: number | null; lng: number | null }>(
  post: { name: string; lat: number; lng: number },
  candidates: T[],
  maxMeters = 600
): T | null {
  const want = normalizeHotelName(post.name);
  if (want.length < 2) return null;
  const near = candidates.filter((c) => c.lat == null || c.lng == null || distanceM(post, { lat: c.lat, lng: c.lng }) <= maxMeters);
  // The same name first; else one containing the other, if nearly as long
  // (「上高地」 isn't 「上高地帝国」).
  const exact = near.filter((c) => normalizeHotelName(c.name) === want);
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  const fits = near.filter((c) => {
    const got = normalizeHotelName(c.name);
    if (got.length < 2 || !(got.includes(want) || want.includes(got))) return false;
    return Math.min(got.length, want.length) / Math.max(got.length, want.length) >= 0.7;
  });
  return fits.length === 1 ? fits[0] : null;
}
