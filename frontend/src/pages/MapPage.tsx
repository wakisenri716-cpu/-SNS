import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, LocateFixed, Navigation, Play, X } from "lucide-react";
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { api } from "../api/client";
import AutoplayVideo from "../components/AutoplayVideo";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { useReelActions } from "../lib/useReelActions";
import { useIsDark } from "../lib/theme";
import { REEL_CATEGORIES, type Reel } from "../types";

// Free vector tiles (no API key), OpenStreetMap data — see openfreemap.org.
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const JAPAN_CENTER: [number, number] = [137.5, 36.2];

// Point MapLibre at its worker as a separate asset (bundlers can't locate it
// on their own once the library is pre-bundled).
setWorkerUrl(workerUrl);

type Filter = "all" | (typeof REEL_CATEGORIES)[number];

// 地図で探す: every located post as a video bubble on a tilted 3D map.
// Tapping a bubble opens a card with the clip, directions, しおり and the
// fullscreen viewer.
export default function MapPage() {
  const { t } = useTranslation();
  const dark = useIsDark();
  const [reels, setReels] = useState<Reel[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const fittedRef = useRef(false);
  const actions = useReelActions(setReels);

  const visible = useMemo(() => reels.filter((r) => filter === "all" || r.category === filter), [reels, filter]);
  const selected = reels.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    api.get<{ items: Reel[] }>("/reels/map").then(({ data }) => setReels(data.items));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: JAPAN_CENTER,
      zoom: 4.5,
      pitch: 50,
      bearing: -12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; theme changes swap the style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark]);

  // Video-bubble markers for the visible posts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = visible.map((reel) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-bubble";
      el.setAttribute("aria-label", reel.locationName || reel.municipality.name);
      const video = document.createElement("video");
      video.src = `${reel.videoUrl}#t=0.1`;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      el.appendChild(video);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedId(reel.id);
        map.easeTo({ center: [reel.locationLng!, reel.locationLat!], zoom: Math.max(map.getZoom(), 13), duration: 900 });
      });
      return new Marker({ element: el, anchor: "bottom" }).setLngLat([reel.locationLng!, reel.locationLat!]).addTo(map);
    });
    if (!fittedRef.current && visible.length > 0) {
      fittedRef.current = true;
      const bounds = new LngLatBounds();
      visible.forEach((r) => bounds.extend([r.locationLng!, r.locationLat!]));
      // Extra bottom padding: the tilt pushes markers up, and the card opens there.
      map.fitBounds(bounds, { padding: { top: 120, bottom: 220, left: 60, right: 60 }, maxZoom: 12, duration: 1200 });
    }
  }, [visible]);

  useEffect(() => {
    markersRef.current.forEach((m, k) => m.getElement().classList.toggle("is-selected", visible[k]?.id === selectedId));
  }, [selectedId, visible]);

  function locate() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        userMarkerRef.current?.remove();
        const dot = document.createElement("span");
        dot.className = "map-me";
        userMarkerRef.current = new Marker({ element: dot }).setLngLat([coords.longitude, coords.latitude]).addTo(map);
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 11, duration: 1500 });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] top-[61px] overflow-hidden rounded-[28px] bg-gray-100 md:relative md:inset-auto md:m-4 md:h-[calc(100vh-2rem)]">
      {/* MapLibre makes its container position: relative, so size it from a wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Category filter over the map */}
      <div className="scrollbar-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto p-3">
        {(["all", ...REEL_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
              filter === c ? "bg-jz-ink text-white" : "glass text-jz-ink"
            }`}
          >
            {t(`category.${c}`)}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={locate}
        aria-label={t("map.locate")}
        className="glass absolute bottom-4 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-jz-ink transition active:scale-90"
      >
        <LocateFixed className={`h-5 w-5 ${locating ? "animate-pulse text-jz-red" : ""}`} />
      </button>

      {visible.length === 0 && reels.length > 0 && (
        <p className="glass absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-jz-ink">{t("map.noneInCategory")}</p>
      )}

      {selected && (
        <div className="animate-sheet-in absolute inset-x-3 bottom-3 z-20 flex gap-3 overflow-hidden rounded-3xl bg-white p-2.5 pr-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] md:left-auto md:w-[380px]">
          <button
            type="button"
            onClick={() => setViewerId(selected.id)}
            className="on-media relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-2xl bg-gray-100"
            aria-label={t("feed.openFullscreen")}
          >
            <AutoplayVideo key={selected.id} src={selected.videoUrl} className="h-full w-full object-cover" />
            <Play className="absolute bottom-2 right-2 h-4 w-4 fill-white text-white drop-shadow" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col py-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-jz-ink">{selected.locationName || selected.municipality.name}</p>
                <Link to={`/municipalities/${selected.municipality.id}`} className="block truncate text-xs text-gray-500 hover:underline">
                  {selected.municipality.name}・{selected.municipality.prefecture}
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t("reelViewer.closeLabel")}
                className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected.caption && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600">{selected.caption}</p>}
            <div className="mt-auto flex gap-1.5 pt-2">
              <Link
                to={`/reels/${selected.id}/access`}
                state={{ reel: selected }}
                className="flex flex-1 items-center justify-center gap-1 rounded-full bg-jz-red py-2 text-xs font-bold text-white active:scale-95"
              >
                <Navigation className="h-3 w-3 fill-white" /> {t("feed.directions")}
              </Link>
              <button
                type="button"
                onClick={() => void actions.toggleSave(selected)}
                aria-pressed={selected.savedByMe}
                className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-xs font-bold active:scale-95 ${
                  selected.savedByMe ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink"
                }`}
              >
                <Bookmark className={`h-3 w-3 ${selected.savedByMe ? "fill-white" : ""}`} />
                {selected.savedByMe ? t("feed.savedPill") : t("feed.savePill")}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerId && (
        <ReelFullscreenViewer
          reels={visible}
          initialId={viewerId}
          onClose={() => setViewerId(null)}
          onToggleLike={actions.toggleLike}
          onToggleSave={actions.toggleSave}
          onToggleFollow={actions.toggleFollow}
          onCommentCountChange={actions.setCommentCount}
        />
      )}
    </div>
  );
}
