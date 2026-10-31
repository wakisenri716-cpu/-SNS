import { prisma } from "../prisma";
import { locatePlace } from "../services/placeLookup";
import { getTransitSuggestion } from "../services/maasProvider";


// しおり (itinerary) of one trip: chains the trip's posts into a route — in
// the order the traveler arranged — with a real-or-mock travel estimate
// between each consecutive pair (see getTransitSuggestion), reusing the exact
// same mock fallback this app uses everywhere else. Both ends of those legs
// are known reel coordinates, so nothing needs geocoding; only the optional
// leg from the trip's typed origin to the first stop does, like the access
// planner. Posts without location data can't be chained and are skipped. The
// frontend turns the legs + each stop's stayMinutes + the start time into a
// timeline.
//
// withOrigin: false leaves the trip origin out entirely — used for the shared
// read-only link, since the origin is often the traveler's home.
export async function buildItinerary(tripId: string, { withOrigin }: { withOrigin: boolean }) {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      items: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          reel: {
            include: { municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } } },
          },
        },
      },
    },
  });

  const ordered = trip.items.filter((s) => s.reel.locationLat != null && s.reel.locationLng != null);
  const stops = ordered.map((s) => s.reel);

  const originLabel = withOrigin ? trip.originLabel : "";
  let originLeg = null;
  // What the typed origin was taken as ("松本駅（長野県）"), see services/placeLookup.ts.
  let originFound: { label: string; kind: string } | null = null;
  if (originLabel && stops.length > 0) {
    let originCoords: { lat: number; lng: number } | null = null;
    try {
      const place = await locatePlace(originLabel);
      if (place) {
        originCoords = { lat: place.lat, lng: place.lng };
        originFound = { label: place.label, kind: place.kind };
      }
    } catch (err) {
      console.error("[itinerary] Locating the origin failed:", err);
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
    trip: { id: trip.id, name: trip.name, startDate: trip.startDate },
    originLabel,
    startTime: trip.startTime,
    originLeg,
    originLocated: originLeg != null,
    originFound,
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
