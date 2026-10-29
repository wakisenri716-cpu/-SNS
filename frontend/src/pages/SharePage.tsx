import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Search, Sparkles } from "lucide-react";
import { api } from "../api/client";
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
// near that point; other text becomes a search.
export default function SharePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ai = useAiAvailable();
  const [shared, setShared] = useState<Shared | null | undefined>(undefined);
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [near, setNear] = useState<{ reel: Reel; km: number }[] | null>(null);
  const [photoSearch, setPhotoSearch] = useState(false);

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
          <Link to="/" className="font-semibold text-jz-red">
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

          {!shared.photo && !where && (
            <Link to="/search" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-jz-red">
              <Search className="h-4 w-4" /> {t("shareIn.search")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
