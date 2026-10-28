import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Navigation2, X } from "lucide-react";
import { bearingDeg, compassPoint, distanceKm, formatDistance } from "../lib/geo";
import { useCompass } from "../lib/useCompass";

// Within this distance the spot counts as reached.
const ARRIVED_M = 40;

const POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

// "コンパスで向かう": for the last stretch on foot — an arrow that turns
// toward the spot as you walk, with the distance left. Without a compass
// (desktop, or access declined) the arrow points relative to north instead,
// with the direction in words.
export default function WalkCompass({ lat, lng, place }: { lat: number; lng: number; place: string }) {
  const { t } = useTranslation();
  const compass = useCompass();
  const target = { lat, lng };
  // The arrow's angle so far, turned the short way each update (350° → 10°
  // is +20°, not a full spin back).
  const shownRotation = useRef(0);

  if (!compass.active) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => void compass.start()}
          className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-gray-50 active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-jz-ink text-white">
            <Compass className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-jz-ink">{t("compass.start")}</span>
            <span className="block text-[11px] text-gray-500">{t("compass.startHint")}</span>
          </span>
        </button>
        {compass.error && <p className="mt-2 text-xs text-jz-red">{t("compass.noLocation")}</p>}
      </div>
    );
  }

  const here = compass.position;
  const meters = here ? distanceKm(here, target) * 1000 : null;
  const bearing = here ? bearingDeg(here, target) : 0;
  // With a compass the arrow is relative to where the phone points; without,
  // relative to north (the dial's N stays at the top).
  const wanted = compass.heading != null ? bearing - compass.heading : bearing;
  const delta = ((((wanted - shownRotation.current) % 360) + 540) % 360) - 180;
  const rotation = shownRotation.current + delta;
  shownRotation.current = rotation;
  const arrived = meters != null && meters <= ARRIVED_M;

  return (
    <section
      aria-label={t("compass.label", { place })}
      className="on-media relative mb-4 overflow-hidden rounded-3xl bg-jz-ink p-5 text-white"
    >
      <button
        type="button"
        onClick={compass.stop}
        aria-label={t("compass.stop")}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-[11px] font-semibold tracking-wide text-white/60">{t("compass.heading", { place })}</p>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0 rounded-full border border-white/15 bg-white/5">
          {compass.heading == null && (
            <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-bold text-white/50">N</span>
          )}
          <span
            className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out"
            style={{ transform: `rotate(${rotation}deg)` }}
            aria-hidden
          >
            <Navigation2 className={`h-14 w-14 ${arrived ? "text-emerald-400" : "text-jz-red"}`} fill="currentColor" strokeWidth={1} />
          </span>
        </div>
        <div className="min-w-0" aria-live="polite">
          {meters == null ? (
            <p className="text-sm text-white/70">{t("compass.locating")}</p>
          ) : arrived ? (
            <>
              <p className="text-2xl font-extrabold">{t("compass.arrived")}</p>
              <p className="mt-1 text-xs text-white/70">{t("compass.arrivedHint")}</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold tabular-nums">{formatDistance(meters / 1000)}</p>
              <p className="mt-1 text-xs text-white/70">
                {t(`compass.dir.${POINTS[compassPoint(bearing)]}`)}
                {compass.heading == null && ` ・ ${t("compass.noHeading")}`}
              </p>
              {here && here.accuracy > 80 && (
                <p className="mt-1 text-[11px] text-amber-300">{t("compass.lowAccuracy", { meters: Math.round(here.accuracy) })}</p>
              )}
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-white/50">{t("compass.note")}</p>
    </section>
  );
}
