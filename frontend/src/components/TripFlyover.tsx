import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useIsDark } from "../lib/theme";

setWorkerUrl(workerUrl);

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

export interface FlyoverStop {
  id: string;
  name: string;
  sub: string;
  lat: number;
  lng: number;
  videoUrl: string;
}

// How long the camera lingers (slowly orbiting) at each stop before moving on.
const HOLD_MS = 2600;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "3Dで巡る": a camera tour of the しおり on a tilted 3D map — the whole
// route first, then flying to each stop in order and circling it, with the
// stop's clip and time in a card. Plays on its own; pause, step or close
// at any time. With reduced motion it cuts between stops instead of flying.
export default function TripFlyover({ stops, onClose }: { stops: FlyoverStop[]; onClose: () => void }) {
  const { t } = useTranslation();
  const dark = useIsDark();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  // -1 = the whole route, then each stop.
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, stops.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, -1));
      if (e.key === " ") setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stops.length]);

  // Map, route line and numbered markers.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [stops[0].lng, stops[0].lat],
      zoom: 10,
      pitch: 55,
      attributionControl: { compact: true },
      interactive: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("trip-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops.map((s) => [s.lng, s.lat]) } },
      });
      map.addLayer({
        id: "trip-route-glow",
        type: "line",
        source: "trip-route",
        paint: { "line-color": "#d7202e", "line-width": 12, "line-opacity": 0.18, "line-blur": 6 },
      });
      map.addLayer({
        id: "trip-route",
        type: "line",
        source: "trip-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d7202e", "line-width": 4, "line-dasharray": [1.5, 1.2] },
      });
    });
    // The tour doesn't wait for the map style: on a slow or failed tile load
    // the camera, pins and cards still play (the route line appears once the
    // style is in).
    setReady(true);
    markersRef.current = stops.map((s, i) => {
      const el = document.createElement("span");
      el.className = "flyover-pin";
      el.textContent = String(i + 1);
      return new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
    });
    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // Created once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera for the current step; when playing, move on after the hold.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const still = reducedMotion();
    markersRef.current.forEach((m, i) => m.getElement().classList.toggle("is-current", i === step));
    let timer: number | undefined;
    let orbit: number | undefined;

    const next = () => {
      if (!playing) return;
      timer = window.setTimeout(() => {
        if (step + 1 < stops.length) setStep(step + 1);
        else setPlaying(false);
      }, still ? HOLD_MS : 300);
    };

    const flightMs = still ? 0 : step < 0 ? 2200 : 3800;
    if (step < 0) {
      const bounds = new LngLatBounds();
      stops.forEach((s) => bounds.extend([s.lng, s.lat]));
      map.fitBounds(bounds, { padding: { top: 120, bottom: 260, left: 60, right: 60 }, maxZoom: 13, pitch: 45, bearing: -15, duration: flightMs });
    } else {
      const s = stops[step];
      const target = { center: [s.lng, s.lat] as [number, number], zoom: 15.5, pitch: 62, bearing: -20 + step * 35 };
      if (still) map.jumpTo(target);
      else map.flyTo({ ...target, duration: flightMs, curve: 1.6, essential: true });
    }

    let arrived = false;
    const onArrived = () => {
      if (arrived) return;
      arrived = true;
      if (!still && step >= 0) {
        // A slow orbit while lingering.
        map.easeTo({ bearing: map.getBearing() + 30, duration: HOLD_MS, easing: (x) => x });
        orbit = window.setTimeout(next, HOLD_MS);
      } else {
        orbit = window.setTimeout(next, step < 0 ? 1200 : 0);
      }
    };
    // "moveend" normally ends the flight; the timer covers a map that can't
    // render (no WebGL, tiles failing), so the tour never stalls.
    map.once("moveend", onArrived);
    const fallback = window.setTimeout(onArrived, flightMs + 600);

    return () => {
      map.off("moveend", onArrived);
      window.clearTimeout(fallback);
      window.clearTimeout(timer);
      window.clearTimeout(orbit);
    };
  }, [step, playing, ready, stops]);

  const current = step >= 0 ? stops[step] : null;
  const atEnd = step === stops.length - 1;

  return createPortal(
    <div className="on-media animate-fade-in fixed inset-0 z-[70] bg-black" role="dialog" aria-modal="true" aria-label={t("flyover.title")}>
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-bold drop-shadow">{t("flyover.title")}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("reelViewer.closeLabel")}
          className="glass-dark flex h-10 w-10 items-center justify-center rounded-full"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Progress: one segment per stop. */}
      <div className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] flex gap-1">
        {stops.map((s, i) => (
          <span key={s.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-white" : "bg-white/30"}`} />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="glass-dark mx-auto flex max-w-md items-center gap-3 rounded-3xl p-3 text-white" aria-live="polite">
          {current ? (
            <>
              <video key={current.id} src={current.videoUrl} className="h-20 w-16 shrink-0 rounded-2xl object-cover" muted playsInline autoPlay loop />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-white/60">
                  {t("flyover.stopOf", { n: step + 1, total: stops.length })}
                </p>
                <p className="truncate text-base font-extrabold">{current.name}</p>
                <p className="truncate text-xs text-white/75">{current.sub}</p>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 px-1">
              <p className="text-base font-extrabold">{t("flyover.overview", { count: stops.length })}</p>
              <p className="text-xs text-white/70">{t("flyover.overviewHint")}</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, -1))}
            disabled={step < 0}
            aria-label={t("flyover.prev")}
            className="glass-dark flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => (atEnd && !playing ? (setStep(-1), setPlaying(true)) : setPlaying((p) => !p))}
            aria-label={playing ? t("flyover.pause") : t("flyover.play")}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-jz-red text-white shadow-[0_8px_24px_-6px_rgba(215,32,46,0.8)] active:scale-95"
          >
            {playing ? <Pause className="h-6 w-6 fill-white" /> : <Play className="ml-0.5 h-6 w-6 fill-white" />}
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, stops.length - 1))}
            disabled={atEnd}
            aria-label={t("flyover.next")}
            className="glass-dark flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
