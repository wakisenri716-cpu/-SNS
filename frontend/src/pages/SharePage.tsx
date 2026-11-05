import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Search, Sparkles, TrainFront } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { looksLikeRoute, parseTransitText, rideDateTimes, type ParsedRoute } from "../lib/transitPaste";
import { guessReservation, type ReservationGuess } from "../lib/reservationPaste";
import { localInputToIso } from "../lib/transportTiming";
import { routeComplete, saveRoute, todayLocal } from "../lib/saveRoute";
import { listTrips, type TripSummary } from "../lib/trips";
import { showToast } from "../lib/toast";
import { useAiAvailable } from "../lib/aiStatus";
import { coordsInText, readExifGps } from "../lib/exifGps";
import { distanceKm, formatDistance } from "../lib/geo";
import type { Reel } from "../types";

const ConciergeSheet = lazy(() => import("../components/ConciergeSheet"));

interface Shared {
  title: string;
  text: string;
  url: string;
  photo: File | null;
}

const NEAR_KM = 50;

// 共有で受け取る: what another app shared to Jaziba (installed app's share
// sheet → manifest share_target → service worker). A photo shows the posts
// near where it was taken (its EXIF location, read on the device) and, with
// AI, posts with a similar feel; a map link with coordinates shows posts
// near that point; a route from a transit app (乗換案内) can be saved to a
// trip as 乗る便; other text becomes a search.
export default function SharePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ai = useAiAvailable();
  const [shared, setShared] = useState<Shared | null | undefined>(undefined);
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [near, setNear] = useState<{ reel: Reel; km: number }[] | null>(null);
  const [photoSearch, setPhotoSearch] = useState(false);
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  // A booking confirmation (楽天トラベル, じゃらん, a restaurant…) → the しおり's 予約.
  const [booking, setBooking] = useState<{ guess: ReservationGuess; text: string } | null>(null);

  // Take what the service worker kept (once: it's deleted after reading).
  useEffect(() => {
    void (async () => {
      try {
        const cache = await caches.open("jaziba-share");
        const meta = await cache.match("/shared/meta");
        if (!meta) return setShared(null);
        const info = (await meta.json()) as { title: string; text: string; url: string; hasPhoto: boolean };
        const photoRes = info.hasPhoto ? await cache.match("/shared/photo") : undefined;
        const blob = photoRes ? await photoRes.blob() : null;
        await Promise.all([cache.delete("/shared/meta"), cache.delete("/shared/photo")]);
        setShared({ ...info, photo: blob ? new File([blob], "shared", { type: blob.type || "image/jpeg" }) : null });
      } catch {
        setShared(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!shared) return;
    if (shared.photo) {
      const url = URL.createObjectURL(shared.photo);
      setPreview(url);
      void shared.photo.arrayBuffer().then((buf) => setWhere(readExifGps(buf)));
      return () => URL.revokeObjectURL(url);
    }
    const text = [shared.url, shared.text, shared.title].join(" ");
    const routeText = [shared.title, shared.text].join("\n");
    const parsed = looksLikeRoute(routeText) ? parseTransitText(routeText) : null;
    if (parsed) return setRoute(parsed);
    const mail = [shared.title, shared.text, shared.url].join("\n");
    const guess = guessReservation(mail);
    if (guess.confirmation || (guess.name && guess.start)) return setBooking({ guess, text: mail });
    const coords = coordsInText(text);
    if (coords) return setWhere(coords);
    // Plain text (a place name, a note): search for it, without the links.
    const words = [shared.title, shared.text].join(" ").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    if (words) navigate(`/search?q=${encodeURIComponent(words.slice(0, 60))}`, { replace: true });
  }, [shared, navigate]);

  useEffect(() => {
    if (!where) return;
    api
      .get<{ items: Reel[] }>("/reels/map")
      .then(({ data }) =>
        setNear(
          data.items
            .filter((r) => r.locationLat != null && r.locationLng != null)
            .map((reel) => ({ reel, km: distanceKm(where, { lat: reel.locationLat!, lng: reel.locationLng! }) }))
            .filter((x) => x.km <= NEAR_KM)
            .sort((a, b) => a.km - b.km)
            .slice(0, 10)
        )
      )
      .catch(() => setNear([]));
  }, [where]);

  if (shared === undefined) return <div className="skeleton mx-auto mt-8 h-40 max-w-lg rounded-3xl" />;

  return (
    <div className="mx-auto flex max-w-lg flex-col p-4 md:p-8">
      <h1 className="text-xl font-extrabold text-jz-ink">{t("shareIn.title")}</h1>
      {!shared ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {t("shareIn.nothing")}{" "}
          <Link to="/" className="font-semibold text-jz-accent">
            {t("shareIn.home")}
          </Link>
        </p>
      ) : (
        <>
          {preview && <img src={preview} alt={t("shareIn.photoAlt")} className="mt-4 max-h-72 w-full rounded-3xl object-cover" />}
          {shared.photo && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              {where ? t("shareIn.photoHasPlace") : t("shareIn.photoNoPlace")}
            </p>
          )}
          {shared.photo && ai && (
            <button
              type="button"
              onClick={() => setPhotoSearch(true)}
              className="ai-card mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-white"
            >
              <Sparkles className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-sm font-extrabold">{t("shareIn.similar")}</span>
                <span className="block text-[11px] text-white/85">{t("shareIn.similarSub")}</span>
              </span>
            </button>
          )}
          {photoSearch && shared.photo && (
            <Suspense fallback={null}>
              <ConciergeSheet initialPhoto={shared.photo} onClose={() => setPhotoSearch(false)} />
            </Suspense>
          )}

          {where && (
            <section className="mt-6">
              <h2 className="text-sm font-bold text-jz-ink">{shared.photo ? t("shareIn.nearPhoto") : t("shareIn.nearPoint")}</h2>
              {near == null ? (
                <div className="skeleton mt-3 h-20 rounded-2xl" />
              ) : near.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">{t("shareIn.noneNear", { km: NEAR_KM })}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {near.map(({ reel, km }) => (
                    <li key={reel.id}>
                      <Link to={`/reels/${reel.id}/access`} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-2 pr-3 hover:bg-gray-50">
                        <span className="h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                          <video src={`${reel.videoUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-jz-ink">{reel.locationName || reel.municipality.name}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {reel.municipality.name}・{reel.municipality.prefecture}
                          </span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-gray-500">{formatDistance(km)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {route && <SharedRoute route={route} />}
          {booking && <SharedBooking guess={booking.guess} text={booking.text} />}

          {!shared.photo && !where && !route && !booking && (
            <Link to="/search" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-jz-accent">
              <Search className="h-4 w-4" /> {t("shareIn.search")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// A route shared from 乗換案内 → pick a trip → saved as its 乗る便.
function SharedRoute({ route }: { route: ParsedRoute }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [tripId, setTripId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    listTrips()
      .then((items) => {
        setTrips(items);
        // The next trip by date, else the one changed last.
        const today = todayLocal();
        const upcoming = items.filter((x) => x.startDate && x.startDate >= today).sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0];
        setTripId((upcoming ?? items[0])?.id ?? "");
      })
      .catch(() => setTrips([]));
  }, [user]);

  const trip = trips?.find((x) => x.id === tripId);
  const date = route.date ?? trip?.startDate ?? todayLocal();
  const times = rideDateTimes(date, route.rides);
  const complete = routeComplete(route);

  async function save() {
    setSaving(true);
    try {
      const count = await saveRoute(tripId, route, date, (k) => t(`transport.kind.${k}`));
      showToast(t("transport.paste.savedAll", { count }));
      navigate(`/itinerary/${tripId}`, { replace: true });
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("transport.error"));
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-3xl border border-gray-200 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-jz-ink">
        <TrainFront className="h-4 w-4 text-jz-accent" /> {t("shareIn.routeTitle")}
      </h2>
      <p className="mt-1 text-[11px] text-gray-500">
        {new Date(`${date}T00:00`).toLocaleDateString(i18n.language, { month: "numeric", day: "numeric", weekday: "short" })}
        {route.date == null && ` ・${t(trip?.startDate ? "shareIn.routeNoDate" : "shareIn.routeToday")}`}
      </p>
      <ol className="mt-2 space-y-1.5">
        {route.rides.map((r, i) => (
          <li key={i} className="rounded-2xl bg-gray-50 px-3 py-2 text-xs tabular-nums text-jz-ink">
            <b>{times[i].departAt.slice(11)}</b> {r.fromName || "?"} → <b>{r.arrive ? times[i].arriveAt.slice(11) : "?"}</b> {r.toName || "?"}
            {(r.name || r.departPlatform) && (
              <span className="mt-0.5 block text-[11px] text-gray-500">{[r.name, r.departPlatform].filter(Boolean).join("・")}</span>
            )}
          </li>
        ))}
      </ol>
      {!user ? (
        <Link to="/login" className="mt-3 inline-block text-sm font-semibold text-jz-accent">
          {t("shareIn.routeLogin")}
        </Link>
      ) : trips == null ? (
        <div className="skeleton mt-3 h-10 rounded-full" />
      ) : trips.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">
          {t("shareIn.routeNoTrips")}{" "}
          <Link to="/itinerary" className="font-semibold text-jz-accent">
            {t("shareIn.routeMakeTrip")}
          </Link>
        </p>
      ) : (
        <>
          <label className="mt-3 block text-[11px] font-semibold text-gray-500">
            {t("shareIn.routeTrip")}
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-jz-ink">
              {trips.map((x) => (
                <option key={x.id} value={x.id}>
                  {[x.name, x.startDate?.replace(/-/g, "/")].filter(Boolean).join("・")}
                </option>
              ))}
            </select>
          </label>
          {complete ? (
            <button type="button" disabled={saving || !tripId} onClick={() => void save()} className="mt-3 w-full rounded-full bg-jz-accent py-3 text-sm font-bold text-white disabled:opacity-60">
              {t("transport.paste.saveAll", { count: route.rides.length })}
            </button>
          ) : (
            <p className="mt-3 text-xs text-gray-500">{t("shareIn.routeIncomplete")}</p>
          )}
        </>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{t("shareIn.routeNote")}</p>
    </section>
  );
}

// A booking confirmation shared from the mail app → pick a trip → its 予約
// (filling in the one written down when 予約へ was pressed, if it's there).
function SharedBooking({ guess, text }: { guess: ReservationGuess; text: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [tripId, setTripId] = useState("");
  const [g, setG] = useState(guess);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listTrips()
      .then((items) => {
        setTrips(items);
        const today = todayLocal();
        const upcoming = items.filter((x) => x.startDate && x.startDate >= today).sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0];
        setTripId((upcoming ?? items[0])?.id ?? "");
      })
      .catch(() => setTrips([]));
  }, [user]);

  async function readAi() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/me/trips/${tripId}/reservations/read`, { text });
      setG((x) => ({ ...x, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== "" && v !== null)) }));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("reservation.readError"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!g.name || !g.start) return setError(t("reservation.needNameDate"));
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ merged?: boolean }>(`/me/trips/${tripId}/reservations`, {
        kind: g.kind ?? "lodging",
        name: g.name,
        startAt: localInputToIso(g.start),
        endAt: g.end ? localInputToIso(g.end) : null,
        address: g.address ?? "",
        phone: g.phone ?? "",
        confirmation: g.confirmation ?? "",
        guests: g.guests ?? null,
        planName: g.planName ?? "",
        priceYen: g.priceYen ?? null,
        payment: g.payment ?? "",
        bookedVia: g.bookedVia ?? "",
        url: g.url ?? "",
      });
      showToast(t(data.merged ? "reservation.mergedShared" : "reservation.saved"));
      navigate(`/itinerary/${tripId}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("reservation.saveError"));
      setBusy(false);
    }
  }

  const rows: [string, string | undefined][] = [
    [t("reservation.name"), g.name],
    [t(g.kind === "lodging" ? "reservation.checkin" : "reservation.when"), g.start && new Date(g.start).toLocaleString(i18n.language, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })],
    [t("reservation.checkout"), g.end && new Date(g.end).toLocaleString(i18n.language, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })],
    [t("reservation.confirmation"), g.confirmation],
    [t("reservation.plan"), g.planName],
    [t("reservation.price"), g.priceYen != null ? `¥${g.priceYen.toLocaleString(i18n.language)}` : undefined],
    [t("reservation.bookedVia"), g.bookedVia],
  ];
  return (
    <section className="mt-6 rounded-2xl border border-gray-200 p-4">
      <p className="text-sm font-bold text-jz-ink">{t("reservation.sharedTitle")}</p>
      <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-semibold text-gray-800">{v}</dd>
            </div>
          ))}
      </dl>
      {!user ? (
        <Link to="/login" state={{ from: "/share" }} className="mt-3 inline-block rounded-full bg-jz-accent px-4 py-2 text-xs font-bold text-white">
          {t("nav.login")}
        </Link>
      ) : trips && trips.length === 0 ? (
        <p className="mt-3 text-xs text-gray-600">{t("reservation.noTrip")}</p>
      ) : (
        <>
          <label className="mt-3 block text-xs font-medium text-gray-500">
            {t("reservation.toTrip")}
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm">
              {(trips ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="mt-2 text-xs text-jz-warm-text">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !tripId || !g.name || !g.start} onClick={() => void save()} className="rounded-full bg-jz-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {t("reservation.addToTrip")}
            </button>
            {(!g.name || !g.start) && (
              <button type="button" disabled={busy || !tripId} onClick={() => void readAi()} className="rounded-full bg-gray-100 px-4 py-2 text-xs font-bold text-jz-ink disabled:opacity-40">
                {t("reservation.readAi")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
