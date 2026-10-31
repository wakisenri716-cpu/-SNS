import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import SchematicRouteMap from "./SchematicRouteMap";
import { projectLatLngToUnitSquare } from "../lib/schematicMap";
import { notifySavesChanged, onSavesChanged } from "../lib/savesChanged";
import type { Itinerary, TransitSuggestion } from "../types";
import { CalendarPlus, ChevronDown, ChevronUp, Flag, GripVertical, House, Link2Off, Pencil, Play, Plus, Share2, Sparkles, Trash2, WifiOff, X } from "lucide-react";
import { downloadItineraryIcs } from "../lib/ics";
import { computeTimeline, formatClock, overnightStops } from "../lib/itineraryTimeline";
import LegRow, { DayDivider } from "./ItineraryLegRow";
import LiveTripBanner from "./LiveTripBanner";
import { loadLiveTrip, type LiveStatus } from "../lib/liveTrip";
import { shareLink } from "../lib/shareLink";
import { showToast } from "../lib/toast";
import { useDragReorder } from "../lib/useDragReorder";
import { useTripLive } from "../lib/useTripLive";
import TripCollab from "./TripCollab";
import TripWeather from "./TripWeather";
import TripTransports, { type TransportDraft } from "./TripTransports";
import { localAt, transportsForLegs } from "../lib/transitPaste";
import { todayLocal } from "../lib/saveRoute";
import TripAlbum from "./TripAlbum";
import OriginFoundNote from "./OriginFoundNote";
import { getCurrentTripId, setCurrentTripId } from "../lib/trips";
import { useTrips } from "../lib/useTrips";

const TripPlanSheet = lazy(() => import("./TripPlanSheet"));
const TripFlyover = lazy(() => import("./TripFlyover"));

type ItineraryView = "list" | "map";

// Only plain traveler accounts have a しおり — municipality/company accounts
// manage posts, not a personal travel plan.
export function useIsTraveler() {
  const { user, municipality, company } = useAuth();
  return !!user && !municipality && !company;
}

const STAY_OPTIONS = [0, 30, 60, 90, 120, 180, 240];

// One trip's しおり: chains the posts put in it — in the order the traveler
// arranged (drag the handle, or the arrows) — into a timed route: start point,
// date and time, real-or-mock travel between stops (GET /me/trips/:id/
// itinerary), and a planned stay at each. The trip can be renamed, dated or
// deleted here. Rendered both in the wide-screen rail below and on the
// /itinerary/:tripId page.
export function ItineraryPanel({
  tripId,
  headingLevel = 2,
  onDeleted,
}: {
  tripId: string;
  headingLevel?: 1 | 2;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const base = `/me/trips/${tripId}`;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ItineraryView>("list");
  const [originDraft, setOriginDraft] = useState("");
  const [startDraft, setStartDraft] = useState("09:00");
  const [planOpen, setPlanOpen] = useState(false);
  const [transportDraft, setTransportDraft] = useState<TransportDraft | null>(null);
  const [flyoverOpen, setFlyoverOpen] = useState(false);
  const [liveTrip, setLiveTrip] = useState(loadLiveTrip);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const liveIndex = live && (live.kind === "at" || live.kind === "moving") ? live.index : -1;
  // Served from the service worker's saved copy because we're offline.
  const [offline, setOffline] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);

  function load() {
    return api.get<Itinerary>(`${base}/itinerary`).then(({ data, headers }) => {
      setOffline(headers["x-jaziba-offline"] === "1");
      setItinerary(data);
      setOriginDraft(data.originLabel);
      setStartDraft(data.startTime);
      setNameDraft(data.trip.name);
      setDateDraft(data.trip.startDate ?? "");
    });
  }

  useEffect(() => {
    setLoading(true);
    setItinerary(null);
    load()
      .catch(() => setItinerary(null))
      .finally(() => setLoading(false));
    return onSavesChanged(() => void load().catch(() => {}));
    // Reload when switching trips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  }

  function reorder(ids: string[]) {
    // Show the new order at once; times and legs follow from the server.
    setItinerary((prev) => prev && { ...prev, stops: ids.map((id) => prev.stops.find((s) => s.id === id)!) });
    void mutate(() => api.put(`${base}/order`, { reelIds: ids }));
  }

  // A rainy-day option goes into that day: after its last visit, before the
  // night's stay if the day ends at one.
  function addToDay(reelId: string, day: number, days: number[]) {
    if (!itinerary) return;
    const ids = itinerary.stops.map((s) => s.id);
    const inDay = ids.map((_, i) => i).filter((i) => days[i] === day);
    let at = (inDay.at(-1) ?? ids.length - 1) + 1;
    if (inDay.length > 0 && itinerary.stops[inDay.at(-1)!].category === "lodging") at -= 1;
    void mutate(async () => {
      await api.put(`${base}/items/${reelId}`);
      await api.put(`${base}/order`, { reelIds: [...ids.slice(0, at), reelId, ...ids.slice(at)] });
      notifySavesChanged();
    });
    showToast(t("weather.added"));
  }

  function move(index: number, delta: -1 | 1) {
    if (!itinerary) return;
    const ids = itinerary.stops.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorder(ids);
  }

  // Out of this trip only (still bookmarked if it's in another).
  function remove(reelId: string) {
    void mutate(async () => {
      await api.delete(`${base}/items/${reelId}`);
      notifySavesChanged();
    });
  }

  function setStay(reelId: string, stayMinutes: number) {
    // Stay length only shifts the timeline, not the legs, so update locally.
    setItinerary((prev) =>
      prev && { ...prev, stops: prev.stops.map((s) => (s.id === reelId ? { ...s, stayMinutes } : s)) }
    );
    void api.patch(`${base}/items/${reelId}`, { stayMinutes });
  }

  // Share with travel companions: a read-only /trip/:token link (without the
  // trip origin). Creating the link and opening the share sheet are one tap.
  async function shareTrip() {
    if (!itinerary) return;
    let token = itinerary.shareToken;
    if (!token) {
      try {
        token = (await api.post<{ token: string }>(`${base}/share`)).data.token;
      } catch {
        showToast(t("itinerary.shareError"));
        return;
      }
      setItinerary((prev) => prev && { ...prev, shareToken: token });
    }
    const url = `${window.location.origin}/trip/${token}`;
    const result = await shareLink(url, `${itinerary.trip.name} | ${t("itinerary.shareTitle")}`);
    if (result === "copied") showToast(t("share.copied"));
    else if (result === "manual") window.prompt(t("share.copyManually"), url);
  }

  async function stopSharing() {
    if (!window.confirm(t("itinerary.stopSharingConfirm"))) return;
    await api.delete(`${base}/share`);
    setItinerary((prev) => prev && { ...prev, shareToken: null });
    showToast(t("itinerary.stopSharingDone"));
  }

  function saveTripSettings(e: FormEvent) {
    e.preventDefault();
    void mutate(() => api.patch(base, { originLabel: originDraft, startTime: startDraft, startDate: dateDraft || null }));
  }

  function saveName(e: FormEvent) {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setEditingName(false);
    void mutate(() => api.patch(base, { name: nameDraft }));
  }

  async function deleteTrip() {
    if (!itinerary || !window.confirm(t("trips.deleteConfirm", { name: itinerary.trip.name }))) return;
    await api.delete(base);
    notifySavesChanged();
    showToast(t("trips.deleted"));
    onDeleted?.();
  }

  const dragger = useDragReorder(itinerary?.stops.map((s) => s.id) ?? [], reorder);

  // 共同編集: others' edits reload this しおり; who else has it open now.
  const { user } = useAuth();
  const { people: here, locations } = useTripLive(
    tripId,
    (by) => {
      if (by.id === user?.id) return;
      void load().catch(() => {});
      showToast(t("collab.changedBy", { name: by.name }));
    },
    !offline
  );
  const othersHere = here.filter((p) => p.id !== user?.id);

  // Timeline: clock time at each arrival/departure, accumulated from the start;
  // a place to stay before the last stop means a night there.
  const overnight = itinerary ? overnightStops(itinerary.stops) : [];
  const { departAt, times } = itinerary
    ? computeTimeline(
        itinerary.startTime,
        itinerary.originLeg?.totalDurationMin ?? null,
        itinerary.stops.map((s) => s.stayMinutes),
        itinerary.legs.map((l) => l.totalDurationMin),
        overnight
      )
    : { departAt: 0, times: [] };
  const multiDay = times.length > 0 && times[times.length - 1].day > 0;

  // この便を保存: each leg (from the origin, then between stops) with its
  // planned clock times, to start a 乗る便 from and to show the ones saved.
  const tripDate = itinerary?.trip.startDate ?? todayLocal();
  const stopName = (i: number) => itinerary!.stops[i].locationName || itinerary!.stops[i].municipality.name;
  const legPlans = itinerary
    ? [
        ...(itinerary.originLeg && itinerary.originLabel && itinerary.stops.length > 0
          ? [{ key: "origin", leg: itinerary.originLeg, fromName: itinerary.originLabel, toName: stopName(0), leaveMin: departAt, arriveMin: times[0]?.arrive ?? departAt }]
          : []),
        ...itinerary.stops.flatMap((_, i) =>
          itinerary.legs[i] && itinerary.stops[i + 1]
            ? [{ key: `leg-${i}`, leg: itinerary.legs[i], fromName: stopName(i), toName: stopName(i + 1), leaveMin: times[i].leave, arriveMin: times[i + 1].arrive }]
            : []
        ),
      ]
    : [];
  const savedByLeg = new Map(
    transportsForLegs(legPlans, itinerary?.transports ?? [], tripDate).map((list, i) => [legPlans[i].key, list])
  );
  const saveLegProps = (key: string) => {
    const plan = legPlans.find((p) => p.key === key);
    if (!plan || offline) return { saved: savedByLeg.get(key) ?? [] };
    const draft = (leg: TransitSuggestion): TransportDraft => ({
      kind: leg.legs.some((l) => l.mode === "bus") && !leg.legs.some((l) => l.mode === "train") ? "bus" : "train",
      fromName: plan.fromName.slice(0, 60),
      toName: plan.toName.slice(0, 60),
      departAt: localAt(tripDate, plan.leaveMin),
      arriveAt: localAt(tripDate, plan.leaveMin + leg.totalDurationMin),
    });
    return { saved: savedByLeg.get(key) ?? [], onSave: () => setTransportDraft(draft(plan.leg)) };
  };

  return (
    <>
      {itinerary && (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <form onSubmit={saveName} className="flex gap-1.5">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={40}
                  aria-label={t("tripPicker.nameLabel")}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-2 py-1 text-base font-bold text-jz-ink outline-none focus:border-gray-400"
                />
                <button type="submit" disabled={!nameDraft.trim()} className="rounded-full bg-jz-ink px-3 text-xs font-bold text-white disabled:opacity-40">
                  {t("itinerary.apply")}
                </button>
              </form>
            ) : headingLevel === 1 ? (
              <h1 className="truncate text-xl font-extrabold text-jz-ink">{itinerary.trip.name}</h1>
            ) : (
              <h2 className="truncate text-base font-bold text-jz-ink">{itinerary.trip.name}</h2>
            )}
            <p className="mt-0.5 text-xs text-gray-500">
              {[
                itinerary.trip.startDate?.replace(/-/g, "/") ?? t("trips.noDate"),
                t("tripPicker.count", { count: itinerary.stops.length }),
                !itinerary.isOwner ? t("collab.ownersTrip", { name: itinerary.owner.name }) : null,
              ]
                .filter(Boolean)
                .join("・")}
            </p>
            {othersHere.length > 0 && (
              <p className="animate-fade-in mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700" aria-live="polite">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {t("collab.hereNow", { names: othersHere.map((p) => p.name).join("、") })}
              </p>
            )}
          </div>
          {!offline && !editingName && (
            <>
              <button type="button" onClick={() => setEditingName(true)} aria-label={t("trips.rename")} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
                <Pencil className="h-4 w-4" />
              </button>
              {itinerary.isOwner && (
                <button type="button" onClick={() => void deleteTrip()} aria-label={t("trips.delete")} className="rounded-full p-1.5 text-gray-500 hover:bg-jz-tint hover:text-jz-red">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}
      {offline && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <WifiOff className="h-3.5 w-3.5 shrink-0" /> {t("itinerary.offlineCopy")}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-xs text-gray-500">{t("itinerary.loading")}</p>
      ) : !itinerary ? (
        <p className="mt-6 text-xs text-gray-500">{t("trips.notFound")}</p>
      ) : itinerary.stops.length === 0 ? (
        <>
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 text-center">
          <p className="text-xs leading-relaxed text-gray-500">{t("trips.emptyTrip", { name: itinerary.trip.name })}</p>
          <Link to="/" className="mt-2 inline-block text-xs font-medium text-gray-900 hover:underline">
            {t("itinerary.emptyCta")}
          </Link>
        </div>
        {!offline && <TripCollab itinerary={itinerary} here={here} locations={locations} onChange={() => void load()} onLeft={onDeleted} />}
        </>
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
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                aria-label={t("trips.dateLabel")}
                className="min-w-0 rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
              <input
                type="time"
                value={startDraft}
                onChange={(e) => setStartDraft(e.target.value)}
                aria-label={t("itinerary.startTimeLabel")}
                className="rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
              <button
                type="submit"
                disabled={
                  busy ||
                  (originDraft.trim() === itinerary.originLabel && startDraft === itinerary.startTime && dateDraft === (itinerary.trip.startDate ?? ""))
                }
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
              <TripPlanSheet tripId={tripId} stops={itinerary.stops} onClose={() => setPlanOpen(false)} onApplied={() => void mutate(async () => {})} />
            </Suspense>
          )}

          <LiveTripBanner
            tripId={tripId}
            state={liveTrip && (!liveTrip.tripId || liveTrip.tripId === tripId) ? liveTrip : null}
            onChange={setLiveTrip}
            times={times}
            departAt={departAt}
            stopNames={itinerary.stops.map((s) => s.locationName || s.caption.slice(0, 30))}
            onStatus={setLive}
          />

          {/* Works offline too (read-only): no signal on the plane. */}
          <TripTransports
            tripId={tripId}
            startDate={itinerary.trip.startDate}
            transports={itinerary.transports ?? []}
            readOnly={offline}
            onChanged={() => void load().catch(() => {})}
            draft={transportDraft}
            onDraftClosed={() => setTransportDraft(null)}
          />

          {!offline && (
            <TripWeather
              startDate={itinerary.trip.startDate}
              stops={itinerary.stops}
              days={times.map((x) => x.day)}
              onAdd={(reelId, day) => addToDay(reelId, day, times.map((x) => x.day))}
            />
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
            {!offline && (
              <button
                type="button"
                onClick={() => setFlyoverOpen(true)}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-jz-red px-3 py-1 text-xs font-bold text-white active:scale-95"
              >
                <Play className="h-3 w-3 fill-white" /> {t("flyover.button")}
              </button>
            )}
          </div>
          {flyoverOpen && (
            <Suspense fallback={null}>
              <TripFlyover
                onClose={() => setFlyoverOpen(false)}
                stops={itinerary.stops.map((stop, i) => ({
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
              {multiDay && <DayDivider day={0} />}
              <p className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span className="flex w-7 justify-center"><House className="h-4 w-4 text-gray-500" /></span>
                {(!itinerary.originLabel || itinerary.originLocated) && (
                  <span className="tabular-nums">{t("itinerary.depart", { time: formatClock(departAt, t) })}</span>
                )}
                <span className="truncate font-normal text-gray-500">{itinerary.originLabel || t("itinerary.noOrigin")}</span>
              </p>
              {itinerary.originLabel && itinerary.originFound && <OriginFoundNote found={itinerary.originFound} className="ml-9 mt-1" />}
              {itinerary.originLeg && <LegRow leg={itinerary.originLeg} {...saveLegProps("origin")} />}
              {itinerary.originLabel && !itinerary.originLocated && (
                <p className="my-1.5 ml-9 text-[11px] leading-relaxed text-amber-700">{t("itinerary.originNotLocated")}</p>
              )}

              <div ref={dragger.containerRef}>
              {itinerary.stops.map((stop, i) => {
                const leg = itinerary.legs[i];
                const { day } = times[i];
                const dragging = dragger.drag?.from === i;
                return (
                  <div key={stop.id}>
                    {dragger.insertAt === i && <div className="ml-9 h-1 rounded-full bg-jz-red" aria-hidden />}
                    {multiDay && day !== (i === 0 ? 0 : times[i - 1].day) && <DayDivider day={day} />}
                    <div
                      data-drag-item
                      className={`relative mt-1.5 flex gap-2 ${dragging ? "z-10 opacity-90 drop-shadow-xl" : ""}`}
                      style={dragging ? { transform: `translateY(${dragger.drag!.offset}px) scale(1.02)` } : undefined}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                          liveIndex === i ? "bg-jz-red" : "bg-gray-900"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div
                        className={`min-w-0 flex-1 rounded-2xl border bg-white p-2 ${
                          liveIndex === i ? "border-jz-red ring-2 ring-jz-red/20" : "border-gray-200/80"
                        }`}
                        aria-current={liveIndex === i ? "step" : undefined}
                      >
                        <div className="flex items-start gap-1">
                          {!offline && (
                            <button
                              type="button"
                              {...dragger.handleProps(i)}
                              aria-label={t("trips.dragHandle")}
                              title={t("trips.dragHandle")}
                              className="-ml-1 cursor-grab rounded px-0.5 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                          )}
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
                            aria-label={t("trips.removeFromTrip")}
                            className="rounded px-1 text-xs text-gray-500 hover:bg-jz-tint hover:text-jz-red"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                          {t("itinerary.arriveDepart", {
                            arrive: formatClock(times[i].arrive, t, day),
                            depart: formatClock(times[i].leave, t, day),
                          })}
                        </p>
                        {overnight[i] ? (
                          <p className="mt-1 text-[11px] font-semibold text-jz-red">{t("itinerary.overnight")}</p>
                        ) : (
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
                        )}
                      </div>
                    </div>
                    {leg && !dragger.drag && (
                      <LegRow
                        leg={leg}
                        from={{ name: stop.locationName || stop.municipality.name, lat: stop.locationLat, lng: stop.locationLng }}
                        to={itinerary.stops[i + 1] && {
                          name: itinerary.stops[i + 1].locationName || itinerary.stops[i + 1].municipality.name,
                          lat: itinerary.stops[i + 1].locationLat,
                          lng: itinerary.stops[i + 1].locationLng,
                        }}
                        {...saveLegProps(`leg-${i}`)}
                      />
                    )}
                  </div>
                );
              })}
              {dragger.insertAt === itinerary.stops.length && <div className="ml-9 mt-1.5 h-1 rounded-full bg-jz-red" aria-hidden />}
              </div>

              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span className="flex w-7 justify-center"><Flag className="h-4 w-4 text-gray-500" /></span>
                <span className="tabular-nums">
                  {t("itinerary.finish", {
                    time: formatClock(times[times.length - 1].leave, t, times[times.length - 1].day),
                  })}
                </span>
              </p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {itinerary.isOwner && (
            <button
              type="button"
              onClick={() => void shareTrip()}
              disabled={offline}
              className="inline-flex items-center gap-1.5 rounded-full bg-jz-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("itinerary.share")}
            </button>
            )}
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
                    itinerary.trip.startDate ??
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
          <TripAlbum
            tripId={tripId}
            stops={itinerary.stops}
            photos={itinerary.photos ?? []}
            isOwner={itinerary.isOwner}
            readOnly={offline}
            onChanged={() => void load().catch(() => {})}
          />
          {!offline && <TripCollab itinerary={itinerary} here={here} locations={locations} onChange={() => void load()} onLeft={onDeleted} />}
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">{t("itinerary.disclaimer")}</p>
        </div>
      )}
    </>
  );
}

// The しおり as a persistent rail in the page's right-hand margin — only on
// wide screens, where the centered page content already leaves that space
// empty. Lives in Layout so it survives page navigation instead of
// re-fetching on every route change. A menu at the top switches trips.
export default function ItineraryRail() {
  const { t } = useTranslation();
  const isTraveler = useIsTraveler();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const trips = useTrips(isTraveler);
  const [picked, setPicked] = useState(getCurrentTripId);
  // On the /itinerary pages the same panel is already the main content.
  if (!isTraveler || pathname.startsWith("/itinerary")) return null;
  const current = trips?.find((trip) => trip.id === picked) ?? trips?.[0] ?? null;
  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white px-5 py-6 xl:flex">
      <div className="mb-4 flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("trips.switch")}</span>
          <select
            value={current?.id ?? ""}
            onChange={(e) => {
              setPicked(e.target.value);
              setCurrentTripId(e.target.value);
            }}
            disabled={!trips?.length}
            className="w-full rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-jz-ink"
          >
            {(trips ?? []).map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.name}（{trip.count}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => navigate("/itinerary?new=1")}
          aria-label={t("tripPicker.newTrip")}
          title={t("tripPicker.newTrip")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jz-red text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {trips && trips.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-4 text-xs leading-relaxed text-gray-500">{t("trips.none")}</p>
      ) : current ? (
        <ItineraryPanel key={current.id} tripId={current.id} onDeleted={() => setPicked(null)} />
      ) : null}
    </aside>
  );
}
