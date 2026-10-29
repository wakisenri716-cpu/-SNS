import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Camera, ChevronLeft, ChevronRight, Navigation, ScanEye, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useArSensors } from "../lib/useArSensors";
import { H_FOV, angleDiff, project, spread, type Projected } from "../lib/arProjection";
import { compassPoint, formatDistance } from "../lib/geo";
import { chooseTrips } from "../lib/trips";
import type { Reel } from "../types";

const POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
const RANGES = [1, 5, 30, 100] as const;

type Spot = Reel & { lat: number; lng: number };

// ARで探す: hold the phone up and the posts around you float over the camera
// picture in their real direction, with how far they are. Without a compass
// (most computers) you look around by dragging; without a camera it still
// works over a plain background.
export default function ArPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sensors = useArSensors();
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [range, setRange] = useState<number | null>(null);
  const [selected, setSelected] = useState<Spot | null>(null);
  // Looking around by dragging, for devices without a compass.
  const [manualHeading, setManualHeading] = useState(0);
  const drag = useRef<{ x: number; heading: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    api
      .get<{ items: Reel[] }>("/reels/map")
      .then(({ data }) =>
        setSpots(
          data.items
            .filter((r) => r.locationLat != null && r.locationLng != null)
            .map((r) => ({ ...r, lat: r.locationLat!, lng: r.locationLng! }))
        )
      )
      .catch(() => setSpots([]));
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = sensors.stream;
  }, [sensors.stream]);

  const position = sensors.position;
  const heading = sensors.heading ?? manualHeading;
  const hasCompass = sensors.heading != null;

  // First fix: the smallest range with a few spots in it (or the widest).
  useEffect(() => {
    if (range != null || !position || !spots) return;
    const counts = RANGES.map((km) => project(position, 0, 90, spots, km).length);
    setRange(RANGES.find((_, i) => counts[i] >= 3) ?? RANGES.at(-1)!);
  }, [position, spots, range]);

  const projected = useMemo(
    () => (position && spots && range ? project(position, heading, sensors.pitch, spots, range) : []),
    [position, spots, range, heading, sensors.pitch]
  );
  const visible = useMemo(() => spread(projected.filter((p) => p.inView).slice(0, 12)), [projected]);
  const leftCount = projected.filter((p) => !p.inView && p.relative < 0).length;
  const rightCount = projected.filter((p) => !p.inView && p.relative > 0).length;

  function onPointerDown(e: ReactPointerEvent) {
    if (hasCompass) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, heading: manualHeading };
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    // Dragging right pulls the view right, like turning left.
    setManualHeading((((drag.current.heading - (dx / window.innerWidth) * H_FOV) % 360) + 360) % 360);
  }
  function onPointerUp() {
    drag.current = null;
  }

  if (!sensors.started) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--header-offset,53px))] flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 px-6 text-center text-white">
        <span className="ai-orb flex h-20 w-20 items-center justify-center rounded-full">
          <ScanEye className="h-10 w-10" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{t("ar.title")}</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">{t("ar.intro")}</p>
        <button
          type="button"
          onClick={() => void sensors.start()}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-jz-red px-7 py-3.5 text-[15px] font-bold text-white shadow-lg active:scale-95"
        >
          <Camera className="h-5 w-5" /> {t("ar.start")}
        </button>
        <p className="mt-4 max-w-sm text-[11px] leading-relaxed text-white/60">{t("ar.privacy")}</p>
        <Link to="/map" className="mt-6 text-xs font-semibold text-white/70 underline underline-offset-2">
          {t("ar.backToMap")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="on-media fixed inset-0 z-[60] touch-none select-none overflow-hidden bg-gradient-to-b from-slate-800 via-slate-700 to-emerald-900 text-white"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {sensors.stream && <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />

      {/* Labels in their real direction; tap one for its card. */}
      <div aria-live="polite" className="absolute inset-0">
        {visible.map((p) => (
          <SpotLabel key={p.spot.id} p={p} onSelect={() => setSelected(p.spot)} selected={selected?.id === p.spot.id} />
        ))}
      </div>

      {leftCount > 0 && (
        <span className="glass-dark absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full px-2 py-1.5 text-xs font-bold" aria-label={t("ar.moreLeft", { count: leftCount })}>
          <ChevronLeft className="h-4 w-4" /> {leftCount}
        </span>
      )}
      {rightCount > 0 && (
        <span className="glass-dark absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full px-2 py-1.5 text-xs font-bold" aria-label={t("ar.moreRight", { count: rightCount })}>
          {rightCount} <ChevronRight className="h-4 w-4" />
        </span>
      )}

      {/* Top: close, which way you face, range. */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            sensors.stop();
            navigate(-1);
          }}
          aria-label={t("ar.close")}
          className="glass-dark flex h-11 w-11 items-center justify-center rounded-full"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="glass-dark rounded-2xl px-3 py-1.5 text-center">
          <p className="text-[15px] font-extrabold tabular-nums">
            {t(`compass.dir.${POINTS[compassPoint(heading)]}`)} {Math.round(heading)}°
          </p>
          <p className="text-[10px] text-white/70">{hasCompass ? t("ar.facing") : t("ar.dragHint")}</p>
        </div>
        <div className="glass-dark flex flex-col overflow-hidden rounded-2xl text-[11px] font-bold" role="group" aria-label={t("ar.range")}>
          {RANGES.map((km) => (
            <button
              key={km}
              type="button"
              aria-pressed={range === km}
              onClick={() => setRange(km)}
              className={`px-2.5 py-1 ${range === km ? "bg-white text-jz-ink" : "text-white/80"}`}
            >
              {km}km
            </button>
          ))}
        </div>
      </div>

      {/* Status lines: what's missing, honestly. */}
      <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-1.5 px-4">
        {sensors.cameraFailed && <Notice>{t("ar.noCamera")}</Notice>}
        {sensors.locationFailed ? (
          <Notice>{t("ar.noLocation")}</Notice>
        ) : !position ? (
          <Notice>{t("ar.locating")}</Notice>
        ) : position.accuracy > 100 ? (
          <Notice>{t("compass.lowAccuracy", { meters: Math.round(position.accuracy) })}</Notice>
        ) : null}
        {position && spots && range && projected.length === 0 && <Notice>{t("ar.noneInRange", { km: range })}</Notice>}
      </div>

      <Radar projected={projected} heading={heading} range={range} />

      {selected && position && (
        <SpotCard spot={selected} p={projected.find((p) => p.spot.id === selected.id) ?? null} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="glass-dark max-w-sm rounded-full px-3.5 py-1.5 text-center text-[11px] leading-snug">{children}</p>;
}

function SpotLabel({ p, onSelect, selected }: { p: Projected<Spot>; onSelect: () => void; selected: boolean }) {
  const { t } = useTranslation();
  const name = p.spot.locationName || p.spot.municipality.name;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      aria-label={t("ar.spotLabel", { place: name, distance: formatDistance(p.km) })}
      className="absolute flex flex-col items-center transition-[left,top] duration-150 ease-linear"
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `translate(-50%, -100%) scale(${p.scale})`, transformOrigin: "bottom center" }}
    >
      <span
        className={`glass-dark flex items-center gap-2 rounded-full py-1 pl-1 pr-3 shadow-lg ${selected ? "ring-2 ring-jz-red" : ""}`}
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-jz-red bg-gray-700">
          {p.spot.thumbnailUrl ? (
            <img src={p.spot.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={`${p.spot.videoUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="max-w-[9rem] text-left">
          <span className="block truncate text-[13px] font-bold">{name}</span>
          <span className="block text-[11px] font-semibold text-white/80">{formatDistance(p.km)}</span>
        </span>
      </span>
      <span className="h-5 w-px bg-white/70" aria-hidden />
      <span className="h-2 w-2 rounded-full bg-jz-red ring-2 ring-white" aria-hidden />
    </button>
  );
}

// Everything around you from above: you in the middle, the camera's view as
// a wedge pointing up, spots as dots.
function Radar({ projected, heading, range }: { projected: Projected<Spot>[]; heading: number; range: number | null }) {
  const { t } = useTranslation();
  const size = 96;
  const r = size / 2;
  return (
    <div className="glass-dark absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 rounded-full p-1" aria-label={t("ar.radar", { count: projected.length })} role="img">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={r} cy={r} r={r - 1} fill="none" stroke="rgba(255,255,255,0.35)" />
        <circle cx={r} cy={r} r={(r - 1) / 2} fill="none" stroke="rgba(255,255,255,0.2)" />
        <path d={wedge(r, r - 1, H_FOV)} fill="rgba(255,255,255,0.18)" />
        {range &&
          projected.map((p) => {
            const rel = (angleDiff(p.bearing, heading) * Math.PI) / 180;
            const d = Math.min(1, p.km / range) * (r - 6);
            return <circle key={p.spot.id} cx={r + d * Math.sin(rel)} cy={r - d * Math.cos(rel)} r={3} fill={p.inView ? "#ff4f5a" : "white"} />;
          })}
        <text x={r + (r - 9) * Math.sin((-heading * Math.PI) / 180)} y={r - (r - 9) * Math.cos((-heading * Math.PI) / 180) + 3} fontSize="9" fontWeight="700" fill="white" textAnchor="middle">
          {t("compass.dir.n")}
        </text>
        <circle cx={r} cy={r} r={3.5} fill="white" />
      </svg>
    </div>
  );
}

function wedge(c: number, radius: number, fov: number) {
  const a = ((fov / 2) * Math.PI) / 180;
  return `M${c},${c} L${c - radius * Math.sin(a)},${c - radius * Math.cos(a)} A${radius},${radius} 0 0 1 ${c + radius * Math.sin(a)},${c - radius * Math.cos(a)} Z`;
}

function SpotCard({ spot, p, onClose }: { spot: Spot; p: Projected<Spot> | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(spot.savedByMe);
  const name = spot.locationName || spot.municipality.name;

  async function save() {
    if (!token) return navigate("/login", { state: { from: "/ar" } });
    setSaved(await chooseTrips([spot.id], name));
  }

  return (
    <div
      className="animate-sheet-in absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-3 rounded-3xl bg-white p-2.5 pr-3 text-jz-ink shadow-2xl md:left-auto md:w-[380px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Link to={`/reels/${spot.id}/access`} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
        <video src={`${spot.videoUrl}#t=0.1`} muted playsInline autoPlay loop className="h-full w-full object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{name}</p>
          <button type="button" onClick={onClose} aria-label={t("ar.closeCard")} className="-mr-1 rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="truncate text-xs text-gray-500">
          {spot.municipality.name}・{spot.municipality.prefecture}
        </p>
        {p && (
          <p className="mt-1 text-xs font-semibold text-jz-ink">
            {t("ar.distanceDirection", { distance: formatDistance(p.km), dir: t(`compass.dir.${POINTS[compassPoint(p.bearing)]}`) })}
          </p>
        )}
        <div className="mt-auto flex gap-2 pt-2">
          <Link
            to={`/reels/${spot.id}/access`}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-jz-red py-2 text-xs font-bold text-white"
          >
            <Navigation className="h-3.5 w-3.5" /> {t("ar.directions")}
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            aria-pressed={saved}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-gray-100 px-3 py-2 text-xs font-bold"
          >
            <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} /> {t("ar.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
