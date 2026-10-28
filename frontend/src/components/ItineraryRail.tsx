import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import SchematicRouteMap from "./SchematicRouteMap";
import { projectLatLngToUnitSquare } from "../lib/schematicMap";
import { notifySavesChanged, onSavesChanged } from "../lib/savesChanged";
import type { Itinerary } from "../types";
import { CalendarPlus, ChevronDown, ChevronUp, Flag, House, Link2Off, Share2, Sparkles, WifiOff, X } from "lucide-react";
import { downloadItineraryIcs } from "../lib/ics";
import { computeTimeline, formatClock } from "../lib/itineraryTimeline";
import LegRow from "./ItineraryLegRow";
import { shareLink } from "../lib/shareLink";
import { showToast } from "../lib/toast";

const TripPlanSheet = lazy(() => import("./TripPlanSheet"));

type ItineraryView = "list" | "map";

// Only plain traveler accounts have a しおり — municipality/company accounts
// manage posts, not a personal travel plan.
export function useIsTraveler() {
  const { user, municipality, company } = useAuth();
  return !!user && !municipality && !company;
}

const STAY_OPTIONS = [0, 30, 60, 90, 120, 180, 240];

// しおり (itinerary) content: chains the signed-in traveler's saved/bookmarked
// reels — in their chosen order — into a timed route: start point and time,
// real-or-mock travel between stops (see GET /reels/itinerary), and a planned
// stay at each. Rendered both as the wide-screen rail below and as the
// /itinerary page used on narrower screens.
export function ItineraryPanel({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const { t } = useTranslation();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ItineraryView>("list");
  const [originDraft, setOriginDraft] = useState("");
  const [startDraft, setStartDraft] = useState("09:00");
  const [planOpen, setPlanOpen] = useState(false);
  // Served from the service worker's saved copy because we're offline.
  const [offline, setOffline] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);

  function load() {
    return api.get<Itinerary>("/reels/itinerary").then(({ data, headers }) => {
      setOffline(headers["x-jaziba-offline"] === "1");
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

  // Share with travel companions: a read-only /trip/:token link (without the
  // trip origin). Creating the link and opening the share sheet are one tap.
  async function shareTrip() {
    if (!itinerary) return;
    let token = itinerary.shareToken;
    if (!token) {
      try {
        token = (await api.post<{ token: string }>("/reels/itinerary/share")).data.token;
      } catch {
        showToast(t("itinerary.shareError"));
        return;
      }
      setItinerary((prev) => prev && { ...prev, shareToken: token });
    }
    const url = `${window.location.origin}/trip/${token}`;
    const result = await shareLink(url, t("itinerary.shareTitle"));
    if (result === "copied") showToast(t("share.copied"));
    else if (result === "manual") window.prompt(t("share.copyManually"), url);
  }

  async function stopSharing() {
    if (!window.confirm(t("itinerary.stopSharingConfirm"))) return;
    await api.delete("/reels/itinerary/share");
    setItinerary((prev) => prev && { ...prev, shareToken: null });
    showToast(t("itinerary.stopSharingDone"));
  }

  function saveTripSettings(e: FormEvent) {
    e.preventDefault();
    void mutate(() => api.put("/reels/itinerary/settings", { originLabel: originDraft, startTime: startDraft }));
  }

  // Timeline: clock time at each arrival/departure, accumulated from the start.
  const { departAt, times } = itinerary
    ? computeTimeline(
        itinerary.startTime,
        itinerary.originLeg?.totalDurationMin ?? null,
        itinerary.stops.map((s) => s.stayMinutes),
        itinerary.legs.map((l) => l.totalDurationMin)
      )
    : { departAt: 0, times: [] };

  return (
    <>
      {headingLevel === 1 ? (
        <h1 className="text-base font-bold text-gray-900">{t("itinerary.heading")}</h1>
      ) : (
        <h2 className="text-base font-bold text-gray-900">{t("itinerary.heading")}</h2>
      )}
      <p className="mt-1 text-xs text-gray-500">{t("itinerary.subtitle")}</p>
      {offline && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <WifiOff className="h-3.5 w-3.5 shrink-0" /> {t("itinerary.offlineCopy")}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-xs text-gray-500">{t("itinerary.loading")}</p>
      ) : !itinerary || itinerary.stops.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 text-center">
          <p className="text-xs text-gray-500">{t("itinerary.empty")}</p>
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

          {itinerary.stops.length >= 2 && (
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              className="ai-border mb-4 block w-full rounded-2xl p-[1.5px] text-left transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
                <span className="ai-orb flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-jz-ink">{t("tripPlan.title")}</span>
                  <span className="block truncate text-[11px] text-gray-500">{t("tripPlan.buttonHint")}</span>
                </span>
              </span>
            </button>
          )}
          {planOpen && itinerary && (
            <Suspense fallback={null}>
              <TripPlanSheet stops={itinerary.stops} onClose={() => setPlanOpen(false)} onApplied={() => void mutate(async () => {})} />
            </Suspense>
          )}

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
                            className="rounded px-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-20"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === itinerary.stops.length - 1}
                            aria-label={t("itinerary.moveDown")}
                            className="rounded px-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-20"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(stop.id)}
                            aria-label={t("itinerary.remove")}
                            className="rounded px-1 text-xs text-gray-500 hover:bg-jz-tint hover:text-jz-red"
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
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void shareTrip()}
              disabled={offline}
              className="inline-flex items-center gap-1.5 rounded-full bg-jz-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("itinerary.share")}
            </button>
            {itinerary.shareToken && !offline && (
              <button
                type="button"
                onClick={() => void stopSharing()}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
              >
                <Link2Off className="h-3.5 w-3.5" /> {t("itinerary.stopSharing")}
              </button>
            )}
          </div>
          {itinerary.shareToken && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{t("itinerary.sharingNote")}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {calendarDate == null ? (
              <button
                type="button"
                onClick={() => {
                  const tomorrow = new Date(Date.now() + 86_400_000);
                  setCalendarDate(
                    `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-200"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> {t("itinerary.addToCalendar")}
              </button>
            ) : (
              <>
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  aria-label={t("itinerary.calendarDate")}
                  className="rounded-xl border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                />
                <button
                  type="button"
                  disabled={!calendarDate}
                  onClick={() => {
                    downloadItineraryIcs(
                      calendarDate,
                      itinerary.stops.map((stop, i) => ({
                        title: stop.locationName || stop.caption.slice(0, 30),
                        location: `${stop.locationName ?? ""} ${stop.municipality.name} ${stop.municipality.prefecture}`.trim(),
                        lat: stop.locationLat,
                        lng: stop.locationLng,
                        url: `${window.location.origin}/reels/${stop.id}/access`,
                        start: times[i].arrive,
                        end: times[i].leave,
                      })),
                      `jaziba-${calendarDate}.ics`
                    );
                    setCalendarDate(null);
                  }}
                  className="rounded-full bg-jz-red px-3 py-1.5 text-xs font-bold text-white"
                >
                  {t("itinerary.downloadCalendar")}
                </button>
              </>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">{t("itinerary.disclaimer")}</p>
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
