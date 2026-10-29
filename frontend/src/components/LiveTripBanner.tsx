import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigation, Timer } from "lucide-react";
import { liveStatus, localDate, minutesSince, saveLiveTrip, type LiveStatus, type LiveTripState } from "../lib/liveTrip";

function formatWait(minutes: number, t: (k: string, o?: Record<string, unknown>) => string) {
  return minutes >= 60 ? t("liveTrip.hoursMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 }) : t("liveTrip.minutes", { m: minutes });
}

// 旅行中モード on the しおり: "今日この旅をはじめる" starts it; from then on
// the card says where the plan has you right now — at a stop and for how
// long, or on the way and how soon you arrive — and the stop is highlighted
// in the list. "+15分" shifts the rest of the day when running late. Works
// from the clock alone, so it keeps going offline.
export default function LiveTripBanner({
  tripId,
  state,
  onChange,
  times,
  departAt,
  stopNames,
  onStatus,
}: {
  tripId: string;
  state: LiveTripState | null;
  onChange: (s: LiveTripState | null) => void;
  times: { arrive: number; leave: number }[];
  departAt: number;
  stopNames: string[];
  onStatus: (status: LiveStatus | null) => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const status = state ? liveStatus(times, departAt, minutesSince(state.date, now) - state.delay) : null;
  const statusKey = status ? `${status.kind}-${"index" in status ? status.index : ""}` : "";
  useEffect(() => {
    onStatus(status);
    // Report when the stop changes, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey]);

  function set(next: LiveTripState | null) {
    saveLiveTrip(next);
    onChange(next);
  }

  if (!state) {
    return (
      <button
        type="button"
        onClick={() => set({ date: localDate(), delay: 0, tripId })}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-3 py-2.5 text-left transition hover:bg-gray-50"
      >
        <Navigation className="h-4 w-4 shrink-0 text-jz-red" />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-jz-ink">{t("liveTrip.start")}</span>
          <span className="block text-[11px] text-gray-500">{t("liveTrip.startHint")}</span>
        </span>
      </button>
    );
  }

  let headline = "";
  let sub = "";
  if (status?.kind === "before") {
    headline = t("liveTrip.before", { wait: formatWait(status.minutes, t) });
  } else if (status?.kind === "at") {
    headline = t("liveTrip.at", { place: stopNames[status.index] });
    sub = t("liveTrip.leaveIn", { wait: formatWait(status.minutes, t) });
  } else if (status?.kind === "moving") {
    headline = t("liveTrip.moving", { place: stopNames[status.index] });
    sub = t("liveTrip.arriveIn", { wait: formatWait(status.minutes, t) });
  } else {
    headline = t("liveTrip.done");
  }

  return (
    <section className="on-media mb-4 rounded-3xl bg-jz-ink p-4 text-white" aria-live="polite" aria-label={t("liveTrip.label")}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-white/70">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jz-red opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-jz-red" />
        </span>
        {t("liveTrip.badge")}
        {state.delay > 0 && <span className="font-normal">・{t("liveTrip.delayed", { m: state.delay })}</span>}
      </p>
      <p className="mt-1.5 text-lg font-extrabold leading-snug">{headline}</p>
      {sub && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-white/75">
          <Timer className="h-3.5 w-3.5" /> {sub}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {status?.kind !== "done" && (
          <button
            type="button"
            onClick={() => set({ ...state, delay: state.delay + 15 })}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25"
          >
            {t("liveTrip.late")}
          </button>
        )}
        <button type="button" onClick={() => set(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10">
          {t("liveTrip.end")}
        </button>
      </div>
    </section>
  );
}

