import { prisma } from "../prisma";
import { geocode, isGoogleMapsConfigured } from "../services/googleMaps";
import { getTransitSuggestion } from "../services/maasProvider";
import { ttlCache } from "./ttlCache";

// The しおり reloads on every save/reorder, and the typed origin rarely
// changes, so its geocode is kept for a few hours.
const originGeocodes = ttlCache<Awaited<ReturnType<typeof geocode>>>(6 * 60 * 60 * 1000, 2000);

// しおり (itinerary): chains a user's saved/bookmarked reels into a route — in
// the order they arranged (PUT /reels/itinerary/order), falling back to save
// order — with a real-or-mock travel estimate between each consecutive pair
// (see getTransitSuggestion), reusing the exact same mock fallback this app
// uses everywhere else. Both ends of those legs are known reel coordinates, so
// nothing needs geocoding; only the optional leg from the user's typed trip
// origin to the first stop does, like the access planner. Reels without
// location data can't be chained and are skipped. The frontend turns the legs
// + each stop's stayMinutes + the start time into a timeline.
//
// withOrigin: false leaves the trip origin out entirely — used for the shared
// read-only link, since the origin is often the traveler's home.
export async function buildItinerary(userId: string, { withOrigin }: { withOrigin: boolean }) {
  const [user, saves] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { itineraryOrigin: true, itineraryStartTime: true },
    }),
    prisma.savedReel.findMany({
      where: { userId },
      include: {
        reel: {
          include: { municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } } },
        },
      },
    }),
  ]);

  const ordered = saves
    .filter((s) => s.reel.locationLat != null && s.reel.locationLng != null)
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
  const stops = ordered.map((s) => s.reel);

  const originLabel = withOrigin ? user?.itineraryOrigin ?? "" : "";
  let originLeg = null;
  if (originLabel && stops.length > 0) {
    let originCoords: { lat: number; lng: number } | null = null;
    if (isGoogleMapsConfigured()) {
      try {
        const geocoded = await originGeocodes.get(originLabel, () => geocode(originLabel));
        if (geocoded) originCoords = { lat: geocoded.lat, lng: geocoded.lng };
      } catch (err) {
        console.error("[reels] Geocoding itinerary origin failed:", err);
      }
    }
    // Without coordinates for the typed origin, the only fallback would be the
    // name-hash mock, which can be hours off — and on a timeline that error
    // shifts every clock time after it. So leave the leg out instead, and let
    // the client say why (originLocated: false).
    if (originCoords) {
      const first = stops[0];
      originLeg = await getTransitSuggestion(
        first.locationName || first.municipality.name,
        first.locationLat!,
        first.locationLng!,
        { label: originLabel, ...originCoords }
      );
    }
  }

  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    legs.push(
      await getTransitSuggestion(
        to.locationName || to.municipality.name,
        to.locationLat!,
        to.locationLng!,
        { label: from.locationName || from.municipality.name, lat: from.locationLat!, lng: from.locationLng! }
      )
    );
  }

  return {
    originLabel,
    startTime: user?.itineraryStartTime ?? "09:00",
    originLeg,
    originLocated: originLeg != null,
    stops: ordered.map(({ reel: r, stayMinutes }) => ({
      id: r.id,
      caption: r.caption,
      category: r.category,
      locationName: r.locationName,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      videoUrl: r.videoUrl,
      municipality: r.municipality,
      stayMinutes,
    })),
    legs,
  };
}
