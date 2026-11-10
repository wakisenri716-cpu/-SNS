import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Building2, Landmark, LocateFixed, Loader2, MapPin, Search, TrainFront, Video, X } from "lucide-react";
import { Map as MapLibreMap, Marker, setWorkerUrl, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { api } from "../api/client";
import { useIsDark } from "../lib/theme";
import { featureName, osmClassKey, type PickedPlace, type PlaceResult } from "../lib/placePick";

// Free vector tiles (no API key), OpenStreetMap data — the same map as 地図で探す.
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const JAPAN_CENTER: [number, number] = [137.5, 36.2];
setWorkerUrl(workerUrl);

// The map's labelled places a tap can pick (OpenMapTiles layers).
const PICKABLE_LAYERS = new Set(["poi", "mountain_peak", "park", "water_name", "aerodrome_label", "place"]);

const SOURCE_ICON = {
  spot: Landmark,
  post: Video,
  station: TrainFront,
  municipality: Building2,
  osm: MapPin,
} as const;

// 場所を選ぶ: find the place by name — Jaziba's own places as you type, every
// named place on the map with 検索 (OpenStreetMap) — or tap it on the map.
export default function PlacePickerSheet({
  initial,
  municipalityId,
  onPick,
  onClose,
}: {
  initial: { name: string; lat: number | null; lng: number | null };
  /** Start near this town (else the poster's own). */
  municipalityId?: string;
  onPick: (place: PickedPlace) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dark = useIsDark();
  const [query, setQuery] = useState(initial.name);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [osm, setOsm] = useState<{ searched: boolean; error?: string }>({
    searched: false,
  });
  const [home, setHome] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<{
    name: string;
    detail: string;
    lat: number;
    lng: number;
  } | null>(initial.lat != null && initial.lng != null ? { name: initial.name, detail: "", lat: initial.lat, lng: initial.lng } : null);
  const [locating, setLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const lastAsked = useRef("");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    void api
      .get<{ lat: number; lng: number } | null>("/places/home", {
        params: municipalityId ? { municipalityId } : {},
      })
      .then(({ data }) => setHome(data))
      .catch(() => {});
  }, [municipalityId]);

  async function search(text: string, withOsm: boolean) {
    const q = text.trim();
    if (!q) return setResults(null);
    const key = `${q}|${withOsm}`;
    lastAsked.current = key;
    setLoading(true);
    try {
      const { data } = await api.get<{
        items: PlaceResult[];
        osm: boolean;
        osmError?: string;
      }>("/places/search", {
        params: {
          q,
          ...(withOsm ? { osm: 1 } : {}),
          ...(home ? { lat: home.lat, lng: home.lng } : {}),
        },
      });
      if (lastAsked.current !== key) return;
      setResults(data.items);
      setOsm({ searched: data.osm, error: data.osmError });
    } catch (err: any) {
      if (lastAsked.current !== key) return;
      setOsm({
        searched: withOsm,
        error: err?.response?.status === 429 ? "busy" : "failed",
      });
    } finally {
      if (lastAsked.current === key) setLoading(false);
    }
  }

  // Jaziba's own places as you type (no outside search until 検索).
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    typingTimer.current = setTimeout(() => void search(query, false), 300);
    return () => clearTimeout(typingTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function submit(e: FormEvent) {
    e.preventDefault();
    // 検索 replaces the as-you-type search still waiting to run.
    clearTimeout(typingTimer.current);
    void search(query, true);
  }

  // The map: created once, starting at the chosen place, else the town.
  useEffect(() => {
    if (!containerRef.current) return;
    const start = selected ?? null;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: start ? [start.lng, start.lat] : JAPAN_CENTER,
      zoom: start ? 15 : 4.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("click", (e) => {
      const box: [[number, number], [number, number]] = [
        [e.point.x - 10, e.point.y - 10],
        [e.point.x + 10, e.point.y + 10],
      ];
      let hit: MapGeoJSONFeature | undefined;
      try {
        hit = map.queryRenderedFeatures(box).find((f) => PICKABLE_LAYERS.has(f.sourceLayer ?? "") && featureName(f.properties));
      } catch {
        hit = undefined;
      }
      if (hit) {
        const point = hit.geometry.type === "Point" ? (hit.geometry.coordinates as [number, number]) : [e.lngLat.lng, e.lngLat.lat];
        setSelected({
          name: featureName(hit.properties),
          detail: t("place.fromMap"),
          lat: point[1],
          lng: point[0],
        });
      } else {
        // Anywhere else: a pin there; the name stays as typed (or can be typed).
        setSelected((prev) => ({
          name: prev?.name || queryRef.current.trim(),
          detail: t("place.pinned"),
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
        }));
      }
    });
    map.on("mousemove", (e) => {
      try {
        const over = map.queryRenderedFeatures(e.point).some((f) => PICKABLE_LAYERS.has(f.sourceLayer ?? "") && featureName(f.properties));
        map.getCanvas().style.cursor = over ? "pointer" : "crosshair";
      } catch {
        /* style still loading */
      }
    });
    // The sheet slides in and its map area takes the room left over: keep the map fitted.
    const fit = new ResizeObserver(() => map.resize());
    fit.observe(containerRef.current);
    return () => {
      fit.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; theme and place changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark]);

  // Nothing chosen yet: start at the town.
  useEffect(() => {
    if (home && !selected) mapRef.current?.jumpTo({ center: [home.lng, home.lat], zoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!map || !selected) return;
    markerRef.current = new Marker({ color: "#0f8a84" }).setLngLat([selected.lng, selected.lat]).addTo(map);
  }, [selected]);

  function choose(p: PlaceResult) {
    setSelected({ name: p.name, detail: p.detail, lat: p.lat, lng: p.lng });
    mapRef.current?.flyTo({
      center: [p.lng, p.lat],
      zoom: Math.max(mapRef.current.getZoom(), 15),
    });
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        setSelected((prev) => ({
          name: prev?.name || query.trim(),
          detail: t("place.here"),
          lat,
          lng,
        }));
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 16 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const canPick = !!selected && !!selected.name.trim();
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[75] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("place.title")}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:h-[85dvh] md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="flex-1 text-[15px] font-bold text-jz-ink">{t("place.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reelViewer.closeLabel")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex gap-2 px-4 pt-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 focus-within:ring-2 focus-within:ring-jz-accent/30">
            <Search className="h-4 w-4 shrink-0 text-gray-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("place.searchPlaceholder")}
              aria-label={t("place.searchPlaceholder")}
              enterKeyHint="search"
              maxLength={100}
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-jz-ink outline-none placeholder:text-gray-500"
            />
          </label>
          <button type="submit" disabled={!query.trim()} className="shrink-0 rounded-full bg-jz-ink px-4 text-sm font-bold text-white disabled:opacity-40">
            {t("place.search")}
          </button>
        </form>
        <p className="px-5 pt-1.5 text-[11px] leading-relaxed text-gray-500">{t("place.hint")}</p>

        <div className="max-h-[32%] min-h-0 shrink-0 overflow-y-auto px-2 pt-1" aria-live="polite">
          {loading && (
            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("place.searching")}
            </p>
          )}
          {results && results.length > 0 && (
            <ul>
              {results.map((p, i) => {
                const Icon = SOURCE_ICON[p.source];
                const active = selected && Math.abs(selected.lat - p.lat) < 1e-6 && Math.abs(selected.lng - p.lng) < 1e-6 && selected.name === p.name;
                return (
                  <li key={`${p.source}-${p.name}-${p.lat}-${p.lng}-${i}`}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      aria-pressed={!!active}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${active ? "bg-jz-tint" : "hover:bg-gray-50"}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-jz-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-jz-ink">{p.name}</span>
                        <span className="block truncate text-[11px] text-gray-500">
                          {[t(p.source === "osm" ? osmClassKey(p.type) : `place.source.${p.source}`), p.detail].filter(Boolean).join("・")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {results && results.length === 0 && !loading && <p className="px-3 py-2 text-xs text-gray-500">{t(osm.searched ? "place.noResults" : "place.noOwnResults")}</p>}
          {results && !osm.searched && !loading && query.trim() && (
            <button
              type="button"
              onClick={() => {
                clearTimeout(typingTimer.current);
                void search(query, true);
              }}
              className="mx-3 my-1 text-xs font-bold text-jz-accent hover:underline"
            >
              {t("place.searchMap", { q: query.trim() })}
            </button>
          )}
          {osm.error && <p className="px-3 py-1 text-xs text-jz-warm-text">{t(osm.error === "busy" ? "place.osmBusy" : "place.osmFailed")}</p>}
          {osm.searched && !osm.error && <p className="px-3 pb-1 text-[10px] text-gray-400">{t("place.credit")}</p>}
        </div>

        <div className="relative min-h-0 flex-1 border-t border-gray-100">
          <div ref={containerRef} className="h-full w-full" aria-label={t("place.mapLabel")} />
          <button
            type="button"
            onClick={locate}
            aria-label={t("place.myLocation")}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-jz-ink shadow-md"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </button>
          <p className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
            {t("place.tapHint")}
          </p>
        </div>

        <div className="border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {selected ? (
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-gray-500">
                {t("place.nameLabel")}
                <input
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                  maxLength={200}
                  placeholder={t("place.namePlaceholder")}
                  className="mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-jz-ink outline-none focus:ring-2 focus:ring-jz-accent/30"
                />
              </label>
              <p className="mt-1 text-[11px] text-gray-500">{[selected.detail, `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`].filter(Boolean).join("・")}</p>
            </div>
          ) : (
            <p className="mb-3 text-xs text-gray-500">{t("place.noneYet")}</p>
          )}
          <button
            type="button"
            disabled={!canPick}
            onClick={() =>
              selected &&
              onPick({
                name: selected.name.trim(),
                lat: selected.lat,
                lng: selected.lng,
              })
            }
            className="w-full rounded-full bg-jz-accent py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("place.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
