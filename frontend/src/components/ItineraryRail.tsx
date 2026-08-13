import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import SchematicRouteMap from "./SchematicRouteMap";
import { projectLatLngToUnitSquare } from "../lib/schematicMap";
import type { Itinerary } from "../types";

const LEG_MODE_ICON: Record<string, string> = { walk: "🚶", drive: "🚗", train: "🚃", bus: "🚌" };
type ItineraryView = "list" | "map";

// しおり (itinerary): a persistent rail in the page's right-hand margin —
// present only on wide screens, where the centered page content already
// leaves that space empty — chaining the signed-in user's saved/bookmarked
// reels into a route with real-or-mock travel time between each consecutive
// stop (see GET /reels/itinerary). Lives in Layout so it survives page
// navigation instead of re-fetching on every route change.
export default function ItineraryRail() {
  const { user, municipality, company } = useAuth();
  const { t } = useTranslation();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ItineraryView>("list");

  // Only for plain traveler accounts — municipality/company accounts manage
  // posts, not a personal travel plan, so this rail has nothing for them.
  const isTraveler = !!user && !municipality && !company;

  useEffect(() => {
    if (!isTraveler) return;
    setLoading(true);
    api
      .get("/reels/itinerary")
      .then(({ data }) => setItinerary(data))
      .finally(() => setLoading(false));
  }, [isTraveler]);

  if (!isTraveler) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white px-5 py-6 xl:flex">
      <h2 className="text-base font-bold text-gray-900">📖 {t("itinerary.heading")}</h2>
      <p className="mt-1 text-xs text-gray-400">{t("itinerary.subtitle")}</p>

      {loading ? (
        <p className="mt-6 text-xs text-gray-400">{t("itinerary.loading")}</p>
      ) : !itinerary || itinerary.stops.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 text-center">
          <p className="text-xs text-gray-400">{t("itinerary.empty")}</p>
          <Link to="/" className="mt-2 inline-block text-xs font-medium text-teal-600 hover:underline">
            {t("itinerary.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-5 flex flex-col">
          <div className="mb-4 flex gap-1.5">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  view === v ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t(v === "list" ? "itinerary.viewList" : "itinerary.viewMap")}
              </button>
            ))}
          </div>

          {view === "map" && (
            <SchematicRouteMap
              className="mb-4 aspect-square w-full"
              captionKey="reelAccessPage.mapSchematicNote"
              points={projectLatLngToUnitSquare(itinerary.stops.map((s) => ({ lat: s.locationLat, lng: s.locationLng }))).map(
                (pt, i) => ({ ...pt, label: itinerary.stops[i].locationName || itinerary.stops[i].caption })
              )}
            />
          )}

          {view === "list" &&
          itinerary.stops.map((stop, i) => {
            const leg = itinerary.legs[i];
            const isLast = i === itinerary.stops.length - 1;
            const legMode = leg?.legs[0]?.mode;
            return (
              <div key={stop.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {!isLast && <span className="my-1 w-0.5 flex-1 border-l-2 border-dashed border-gray-200" />}
                </div>
                <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                  <Link to={`/municipalities/${stop.municipality.id}`} className="block hover:underline">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {stop.locationName || stop.caption}
                    </p>
                  </Link>
                  <p className="truncate text-xs text-gray-400">{stop.municipality.name}</p>
                  {leg && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-teal-700">
                      <span>{legMode ? LEG_MODE_ICON[legMode] : ""}</span>
                      <span>
                        {t("itinerary.legSummary", {
                          mode: t(TRANSIT_MODE_LABEL_KEY[legMode ?? ""] ?? "accessPlanner.modeDrive"),
                          duration: t("accessPlanner.duration", { minutes: leg.totalDurationMin }),
                        })}
                      </span>
                      {leg.isMock && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                          {t("municipalityProfile.mockData")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{t("itinerary.disclaimer")}</p>
        </div>
      )}
    </aside>
  );
}
