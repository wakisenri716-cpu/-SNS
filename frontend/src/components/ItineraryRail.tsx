import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import SchematicRouteMap from "./SchematicRouteMap";
import { projectLatLngToUnitSquare } from "../lib/schematicMap";
import { notifySavesChanged, onSavesChanged } from "../lib/savesChanged";
import type { Itinerary, TransitSuggestion } from "../types";
import ModeIcon from "./ModeIcon";
import { ChevronDown, ChevronUp, Flag, House, X } from "lucide-react";

type ItineraryView = "list" | "map";

// Only plain traveler accounts have a しおり — municipality/company accounts
// manage posts, not a personal travel plan.
export function useIsTraveler() {
  const { user, municipality, company } = useAuth();
  return !!user && !municipality && !company;
}

const STAY_OPTIONS = [0, 30, 60, 90, 120, 180, 240];

// "HH:MM" -> minutes since midnight (09:00 if malformed).
function parseClock(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
}

function formatClock(totalMin: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  const day = Math.floor(totalMin / (24 * 60));
  const min = totalMin % (24 * 60);
  const time = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  return day > 0 ? t("itinerary.nextDay", { time }) : time;
}

// A leg can be several sub-legs (e.g. walk 10分 + train 83分); label it by
// the one that takes longest, not just the first.
function mainMode(leg: TransitSuggestion) {
  return leg.legs.reduce((a, b) => (b.durationMin > a.durationMin ? b : a), leg.legs[0])?.mode;
}

function LegRow({ leg }: { leg: TransitSuggestion }) {
  const { t } = useTranslation();
  const mode = mainMode(leg);
  return (
    <p className="my-1.5 ml-9 flex flex-wrap items-center gap-1 text-xs text-gray-600">
      <ModeIcon mode={mode} className="h-3.5 w-3.5" />
      <span>
        {t("itinerary.legSummary", {
          mode: t(TRANSIT_MODE_LABEL_KEY[mode ?? ""] ?? "accessPlanner.modeDrive"),
          duration: t("accessPlanner.duration", { minutes: leg.totalDurationMin }),
        })}
      </span>
      {leg.isMock && (
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
          {t("municipalityProfile.mockData")}
        </span>
      )}
    </p>
  );
}

// しおり (itinerary) content: chains the signed-in traveler's saved/bookmarked
// reels — in their chosen order — into a timed route: start point and time,
// real-or-mock travel between stops (see GET /reels/itinerary), and a planned
// stay at each. Rendered both as the wide-screen rail below and as the
// /itinerary page used on narrower screens.
export function ItineraryPanel() {
  const { t } = useTranslation();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ItineraryView>("list");
  const [originDraft, setOriginDraft] = useState("");
  const [startDraft, setStartDraft] = useState("09:00");

  function load() {
    return api.get<Itinerary>("/reels/itinerary").then(({ data }) => {
      setItinerary(data);
      setOriginDraft(data.originLabel);
      setStartDraft(data.startTime);
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    return onSavesChanged(() => void load());
  }, []);

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    if (!itinerary) return;
    const ids = itinerary.stops.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void mutate(() => api.put("/reels/itinerary/order", { reelIds: ids }));
  }

  function remove(reelId: string) {
    void mutate(async () => {
      await api.delete(`/reels/${reelId}/save`);
      notifySavesChanged();
    });
  }

  function setStay(reelId: string, stayMinutes: number) {
    // Stay length only shifts the timeline, not the legs, so update locally.
    setItinerary((prev) =>
      prev && { ...prev, stops: prev.stops.map((s) => (s.id === reelId ? { ...s, stayMinutes } : s)) }
    );
    void api.patch(`/reels/${reelId}/save`, { stayMinutes });
  }

  function saveTripSettings(e: FormEvent) {
    e.preventDefault();
    void mutate(() => api.put("/reels/itinerary/settings", { originLabel: originDraft, startTime: startDraft }));
  }

  // Timeline: clock time at each arrival/departure, accumulated from the start.
  let clock = itinerary ? parseClock(itinerary.startTime) : 0;
  const departAt = clock;
  if (itinerary?.originLeg) clock += itinerary.originLeg.totalDurationMin;
  const times =
    itinerary?.stops.map((stop, i) => {
      const arrive = clock;
      const leave = arrive + stop.stayMinutes;
      clock = leave + (itinerary.legs[i]?.totalDurationMin ?? 0);
      return { arrive, leave };
    }) ?? [];

  return (
    <>
      <h2 className="text-base font-bold text-gray-900">{t("itinerary.heading")}</h2>
      <p className="mt-1 text-xs text-gray-400">{t("itinerary.subtitle")}</p>

      {loading ? (
        <p className="mt-6 text-xs text-gray-400">{t("itinerary.loading")}</p>
      ) : !itinerary || itinerary.stops.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 text-center">
          <p className="text-xs text-gray-400">{t("itinerary.empty")}</p>
          <Link to="/" className="mt-2 inline-block text-xs font-medium text-gray-900 hover:underline">
            {t("itinerary.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-5 flex flex-col">
          <form onSubmit={saveTripSettings} className="mb-4 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
            <span className="text-xs font-semibold text-gray-500">{t("itinerary.tripSettings")}</span>
            <input
              value={originDraft}
              onChange={(e) => setOriginDraft(e.target.value)}
              placeholder={t("itinerary.originPlaceholder")}
              className="w-full rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startDraft}
                onChange={(e) => setStartDraft(e.target.value)}
                aria-label={t("itinerary.startTimeLabel")}
                className="rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
              <button
                type="submit"
                disabled={busy || (originDraft.trim() === itinerary.originLabel && startDraft === itinerary.startTime)}
                className="ml-auto rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {t("itinerary.apply")}
              </button>
            </div>
          </form>

          <div className="mb-4 flex gap-1.5">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  view === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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

          {view === "list" && (
            <div className={busy ? "pointer-events-none opacity-60" : ""}>
              <p className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span className="flex w-7 justify-center"><House className="h-4 w-4 text-gray-500" /></span>
                {(!itinerary.originLabel || itinerary.originLocated) && (
                  <span className="tabular-nums">{t("itinerary.depart", { time: formatClock(departAt, t) })}</span>
                )}
                <span className="truncate font-normal text-gray-500">{itinerary.originLabel || t("itinerary.noOrigin")}</span>
              </p>
              {itinerary.originLeg && <LegRow leg={itinerary.originLeg} />}
              {itinerary.originLabel && !itinerary.originLocated && (
                <p className="my-1.5 ml-9 text-[11px] leading-relaxed text-amber-700">{t("itinerary.originNotLocated")}</p>
              )}

              {itinerary.stops.map((stop, i) => {
                const leg = itinerary.legs[i];
                return (
                  <div key={stop.id}>
                    <div className="mt-1.5 flex gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 rounded-2xl border border-gray-200/80 bg-white p-2">
                        <div className="flex items-start gap-1">
                          <Link to={`/reels/${stop.id}/access`} className="min-w-0 flex-1 hover:underline">
                            <p className="truncate text-sm font-semibold text-gray-900">{stop.locationName || stop.caption}</p>
                          </Link>
                          <button
                            type="button"
                            onClick={() => move(i, -1)}
                            disabled={i === 0}
                            aria-label={t("itinerary.moveUp")}
                            className="rounded px-1 text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-20"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === itinerary.stops.length - 1}
                            aria-label={t("itinerary.moveDown")}
                            className="rounded px-1 text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-20"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(stop.id)}
                            aria-label={t("itinerary.remove")}
                            className="rounded px-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                          {t("itinerary.arriveDepart", {
                            arrive: formatClock(times[i].arrive, t),
                            depart: formatClock(times[i].leave, t),
                          })}
                        </p>
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                          {t("itinerary.stayLabel")}
                          <select
                            value={stop.stayMinutes}
                            onChange={(e) => setStay(stop.id, Number(e.target.value))}
                            className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] text-gray-700"
                          >
                            {[...new Set([...STAY_OPTIONS, stop.stayMinutes])]
                              .sort((a, b) => a - b)
                              .map((m) => (
                                <option key={m} value={m}>
                                  {t("itinerary.stayMinutes", { minutes: m })}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    {leg && <LegRow leg={leg} />}
                  </div>
                );
              })}

              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span className="flex w-7 justify-center"><Flag className="h-4 w-4 text-gray-500" /></span>
                <span className="tabular-nums">
                  {t("itinerary.finish", { time: formatClock(times[times.length - 1].leave, t) })}
                </span>
              </p>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{t("itinerary.disclaimer")}</p>
        </div>
      )}
    </>
  );
}

// The しおり as a persistent rail in the page's right-hand margin — only on
// wide screens, where the centered page content already leaves that space
// empty. Lives in Layout so it survives page navigation instead of
// re-fetching on every route change.
export default function ItineraryRail() {
  const isTraveler = useIsTraveler();
  const { pathname } = useLocation();
  // On the /itinerary page the same panel is already the main content.
  if (!isTraveler || pathname === "/itinerary") return null;
  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white px-5 py-6 xl:flex">
      <ItineraryPanel />
    </aside>
  );
}
