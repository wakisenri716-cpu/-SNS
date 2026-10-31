import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { Bookmark, Check, Clock, Flag, MapPin, Play } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useIsTraveler } from "../components/ItineraryRail";
import LegRow, { DayDivider } from "../components/ItineraryLegRow";
import { computeTimeline, formatClock, overnightStops } from "../lib/itineraryTimeline";
import { chooseTrips } from "../lib/trips";
import { showToast } from "../lib/toast";
import type { SharedTrip } from "../types";
import TripTransports from "../components/TripTransports";
import LegOptions from "../components/LegOptions";
import { chosenFor, legMinutesWithChoices, optionsFor } from "../lib/legOptions";

const TripFlyover = lazy(() => import("../components/TripFlyover"));

// A しおり a traveler shared with their companions (/trip/:token): the same
// timed route, read-only and without where they start from. Signed-in
// travelers can copy any stop — or all of them — into their own しおり.
export default function TripPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const { token: authToken } = useAuth();
  const isTraveler = useIsTraveler();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [flyoverOpen, setFlyoverOpen] = useState(false);

  useEffect(() => {
    setTrip(null);
    setMissing(false);
    api
      .get<SharedTrip>(`/trips/${token}`)
      .then(({ data }) => {
        setTrip(data);
        setSaved(new Set(data.savedIds));
      })
      .catch((err) => {
        if (isAxiosError(err) && err.response?.status === 404) setMissing(true);
        else showToast(t("trip.loadError"));
      });
  }, [token, authToken, t]);

  // Into the traveler's own trip(s), chosen in the "どの旅に入れる？" sheet.
  async function save(ids: string[]) {
    if (!authToken) return navigate("/login", { state: { from: `/trip/${token}` } });
    if (!trip) return;
    const title =
      ids.length === 1
        ? (trip.stops.find((s) => s.id === ids[0])?.locationName ?? trip.tripName)
        : t("trip.fromTrip", { name: trip.ownerName, trip: trip.tripName });
    setBusy(true);
    try {
      const savedOne = await chooseTrips(ids, title);
      if (ids.length === 1) {
        setSaved((prev) => {
          const next = new Set(prev);
          if (savedOne) next.add(ids[0]);
          else next.delete(ids[0]);
          return next;
        });
      } else if (savedOne) {
        setSaved((prev) => new Set([...prev, ...ids]));
      }
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-4xl">🗺️</p>
        <h1 className="mt-4 text-lg font-bold text-jz-ink">{t("trip.missingTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{t("trip.missingBody")}</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-jz-red px-5 py-2.5 text-sm font-bold text-white">
          {t("trip.explore")}
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 md:p-8">
        <div className="skeleton h-8 w-2/3 rounded-xl" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-3xl" />
        ))}
      </div>
    );
  }

  const overnight = overnightStops(trip.stops);
  // A leg with a chosen way (区間の行き方) takes its time.
  const { legMinutes } = legMinutesWithChoices(trip.stops.map((s) => s.id), trip.legs.map((l) => l.totalDurationMin), null, trip.legOptions);
  const { times } = computeTimeline(trip.startTime, null, trip.stops.map((s) => s.stayMinutes), legMinutes, overnight);
  const multiDay = times.length > 0 && times[times.length - 1].day > 0;
  const unsaved = trip.stops.filter((s) => !saved.has(s.id)).map((s) => s.id);
  const canCopy = !trip.isMine && (isTraveler || !authToken);
  const municipalities = [...new Set(trip.stops.map((s) => s.municipality.name))];

  return (
    <div className="mx-auto flex max-w-lg flex-col p-4 pb-44 md:p-8 md:pb-28">
      <p className="text-xs font-semibold tracking-wide text-jz-red">{t("trip.eyebrow")}</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-snug tracking-tight text-jz-ink">
        {t("trip.titleNamed", { name: trip.ownerName, trip: trip.tripName })}
      </h1>
      <p className="mt-1.5 text-sm text-gray-500">
        {t("trip.summary", { count: trip.stops.length, places: municipalities.slice(0, 3).join("・") })}
      </p>
      {trip.stops.length > 0 && (
        <button
          type="button"
          onClick={() => setFlyoverOpen(true)}
          className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-jz-ink px-4 py-2 text-sm font-bold text-white active:scale-95"
        >
          <Play className="h-3.5 w-3.5 fill-white" /> {t("flyover.button")}
        </button>
      )}
      {(trip.transports?.length ?? 0) > 0 && (
        <div className="mt-5">
          <TripTransports tripId="" startDate={trip.startDate} transports={trip.transports!} readOnly />
        </div>
      )}
      {flyoverOpen && (
        <Suspense fallback={null}>
          <TripFlyover
            onClose={() => setFlyoverOpen(false)}
            stops={trip.stops.map((stop, i) => ({
              id: stop.id,
              name: stop.locationName || stop.caption.slice(0, 30),
              sub: `${t("itinerary.arriveDepart", {
                arrive: formatClock(times[i].arrive, t, times[i].day),
                depart: formatClock(times[i].leave, t, times[i].day),
              })}・${stop.municipality.name}`,
              lat: stop.locationLat,
              lng: stop.locationLng,
              videoUrl: stop.videoUrl,
            }))}
          />
        </Suspense>
      )}
      {trip.isMine && (
        <p className="mt-4 rounded-2xl bg-jz-tint px-4 py-3 text-xs leading-relaxed text-jz-ink">{t("trip.mineNote")}</p>
      )}

      {trip.stops.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">{t("trip.empty")}</p>
      ) : (
        <ol className="mt-6">
          {trip.stops.map((stop, i) => {
            const isSaved = saved.has(stop.id);
            const { day } = times[i];
            return (
              <li key={stop.id} className="animate-page-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                {multiDay && (i === 0 || day !== times[i - 1].day) && <DayDivider day={day} />}
                <div className="flex gap-3">
                  <span className="mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jz-red text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-gray-200 bg-white">
                    <Link to={`/reels/${stop.id}/access`} className="flex gap-3 p-2.5">
                      <span className="on-media relative h-20 w-16 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                        <video src={`${stop.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      </span>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="block truncate text-sm font-bold text-jz-ink">{stop.locationName || stop.caption}</span>
                        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {stop.municipality.name}・{stop.municipality.prefecture}
                        </span>
                        <span className="mt-1.5 flex items-center gap-1 text-xs tabular-nums text-gray-700">
                          <Clock className="h-3 w-3 shrink-0" />
                          {t("itinerary.arriveDepart", {
                            arrive: formatClock(times[i].arrive, t, day),
                            depart: formatClock(times[i].leave, t, day),
                          })}
                        </span>
                        {overnight[i] && <span className="mt-1 block text-[11px] font-semibold text-jz-red">{t("itinerary.overnight")}</span>}
                      </span>
                    </Link>
                    {canCopy && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save([stop.id])}
                        className={`flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-2 text-xs font-semibold ${
                          isSaved ? "text-gray-500" : "text-jz-ink hover:bg-gray-50"
                        }`}
                      >
                        {isSaved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                        {isSaved ? t("trip.inMyItinerary") : t("trip.addOne")}
                      </button>
                    )}
                  </div>
                </div>
                {trip.legs[i] && (
                  <LegRow
                    leg={trip.legs[i]}
                    from={{ name: stop.locationName || stop.municipality.name, lat: stop.locationLat, lng: stop.locationLng }}
                    to={trip.stops[i + 1] && {
                      name: trip.stops[i + 1].locationName || trip.stops[i + 1].municipality.name,
                      lat: trip.stops[i + 1].locationLat,
                      lng: trip.stops[i + 1].locationLng,
                    }}
                    className="my-2 ml-10"
                    chosen={trip.stops[i + 1] ? chosenFor(trip.legOptions, stop.id, trip.stops[i + 1].id) : null}
                  />
                )}
                {trip.legs[i] && trip.stops[i + 1] && (
                  <LegOptions
                    tripId=""
                    readOnly
                    className="mb-2 ml-10"
                    leg={{
                      fromId: stop.id,
                      toId: trip.stops[i + 1].id,
                      fromName: stop.locationName || stop.municipality.name,
                      toName: trip.stops[i + 1].locationName || trip.stops[i + 1].municipality.name,
                      departLocal: "",
                      estimateMin: trip.legs[i].totalDurationMin,
                    }}
                    options={optionsFor(trip.legOptions, stop.id, trip.stops[i + 1].id)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {trip.stops.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
          <span className="flex w-7 justify-center">
            <Flag className="h-4 w-4 text-gray-500" />
          </span>
          <span className="tabular-nums">{t("itinerary.finish", { time: formatClock(times[times.length - 1].leave, t, times[times.length - 1].day) })}</span>
        </p>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-gray-500">{t("trip.timeNote", { time: trip.startTime })}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{t("itinerary.disclaimer")}</p>

      {canCopy && unsaved.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(unsaved)}
            className="flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-jz-red py-3.5 text-sm font-bold text-white shadow-lg shadow-jz-red/30 active:scale-[0.98] disabled:opacity-60"
          >
            <Bookmark className="h-4 w-4 fill-white" />
            {authToken ? t("trip.addAll", { count: unsaved.length }) : t("trip.loginToAdd")}
          </button>
        </div>
      )}
    </div>
  );
}
