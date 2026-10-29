import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Umbrella } from "lucide-react";
import { api } from "../api/client";
import { formatDistance } from "../lib/geo";
import { WEATHER_EMOJI, addDays, forecastWindow, type DayForecast, type IndoorOption } from "../lib/weather";
import type { ItineraryStop } from "../types";

// 天気予報 for the しおり: each day's forecast at that day's first stop
// (Open-Meteo, up to 16 days ahead), and for a wet day, indoor posts nearby
// that can be added to that day in one tap.
export default function TripWeather({
  startDate,
  stops,
  days,
  onAdd,
}: {
  startDate: string | null;
  stops: ItineraryStop[];
  /** Day index (0 = first day) of each stop, from the timeline. */
  days: number[];
  /** Put this post into the trip as part of day `day`. */
  onAdd?: (reelId: string, day: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const window_ = startDate ? forecastWindow(startDate) : null;
  // The first stop of each day: where that day's weather is looked up.
  const dayStarts = useMemo(() => {
    const seen = new Map<number, ItineraryStop>();
    stops.forEach((s, i) => !seen.has(days[i]) && seen.set(days[i], s));
    return [...seen.entries()].slice(0, 14);
  }, [stops, days]);
  const key = startDate ? `${startDate}|${dayStarts.map(([d, s]) => `${d}:${s.locationLat},${s.locationLng}`).join(";")}` : "";
  const [forecasts, setForecasts] = useState<{ key: string; days: (DayForecast | null)[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!startDate || window_ !== "inRange" || dayStarts.length === 0) return;
    let alive = true;
    setFailed(false);
    fetchForecasts(key, () =>
      api
        .post<{ days: (DayForecast | null)[] }>("/weather", {
          points: dayStarts.map(([day, s]) => ({ lat: s.locationLat, lng: s.locationLng, date: addDays(startDate, day) })),
        })
        .then(({ data }) => data.days)
    )
      .then((days) => alive && setForecasts({ key, days }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // `key` captures the dates and places.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, window_]);

  if (!startDate) return <p className="mb-3 text-[11px] text-gray-500">{t("weather.needDate")}</p>;
  if (window_ === "past" || dayStarts.length === 0) return null;
  if (window_ === "tooFar") return <p className="mb-3 text-[11px] text-gray-500">{t("weather.tooFar")}</p>;
  if (failed) return <p className="mb-3 text-[11px] text-gray-500">{t("weather.unavailable")}</p>;
  if (!forecasts || forecasts.key !== key) return <div className="skeleton mb-3 h-14 rounded-2xl" />;

  const multiDay = dayStarts.length > 1;
  const wet = dayStarts
    .map(([day, stop], i) => ({ day, stop, f: forecasts.days[i] }))
    .filter((x): x is { day: number; stop: ItineraryStop; f: DayForecast } => !!x.f && isWet(x.f));

  return (
    <section className="mb-4" aria-label={t("weather.heading")}>
      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dayStarts.map(([day], i) => {
          const f = forecasts.days[i];
          const date = addDays(startDate, day);
          return (
            <div key={day} className="min-w-[7.5rem] shrink-0 rounded-2xl bg-gradient-to-br from-sky-50 to-white px-3 py-2 ring-1 ring-sky-100">
              <p className="text-[11px] font-semibold text-gray-500">
                {multiDay && `${t("itinerary.dayLabel", { day: day + 1 })}・`}
                {new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, { month: "numeric", day: "numeric", weekday: "short" })}
              </p>
              {f ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-jz-ink">
                  <span className="text-xl leading-none" role="img" aria-label={t(`weather.kind.${f.kind}`)}>
                    {WEATHER_EMOJI[f.kind]}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {f.tMax ?? "–"}°<span className="font-normal text-gray-400">/{f.tMin ?? "–"}°</span>
                  </span>
                  {f.pop != null && (
                    <span className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-sky-700">
                      <Umbrella className="h-3 w-3" />
                      {f.pop}%
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">{t("weather.noForecast")}</p>
              )}
            </div>
          );
        })}
      </div>
      {wet.map(({ day, stop, f }) => (
        <WetDayOptions
          key={day}
          day={multiDay ? day + 1 : null}
          kind={f.kind}
          pop={f.pop}
          near={stop}
          exclude={stops.map((s) => s.id)}
          onAdd={onAdd ? (reelId) => onAdd(reelId, day) : undefined}
        />
      ))}
      <p className="mt-1 text-right text-[10px] text-gray-400">
        {t("weather.credit")}{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
          Open-Meteo.com
        </a>
      </p>
    </section>
  );
}

// The しおり reloads often (every edit, live updates from companions), so the
// same days' forecast is reused for 30 minutes on this page.
const recent = new Map<string, { at: number; days: Promise<(DayForecast | null)[]> }>();
function fetchForecasts(key: string, load: () => Promise<(DayForecast | null)[]>) {
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.days;
  const days = load();
  recent.set(key, { at: Date.now(), days });
  days.catch(() => recent.delete(key));
  return days;
}

function isWet(f: DayForecast) {
  return f.kind === "rain" || f.kind === "snow" || f.kind === "thunder" || (f.pop ?? 0) >= 60;
}

function WetDayOptions({
  day,
  kind,
  pop,
  near,
  exclude,
  onAdd,
}: {
  day: number | null;
  kind: DayForecast["kind"];
  pop: number | null;
  near: ItineraryStop;
  exclude: string[];
  onAdd?: (reelId: string) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<IndoorOption[] | null>(null);
  const excludeKey = exclude.join(",");

  useEffect(() => {
    let alive = true;
    api
      .get<{ items: IndoorOption[] }>("/weather/indoor", { params: { lat: near.locationLat, lng: near.locationLng, exclude: excludeKey } })
      .then(({ data }) => alive && setOptions(data.items))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, [near.locationLat, near.locationLng, excludeKey]);

  const headline = t(kind === "snow" ? "weather.snowDay" : "weather.wetDay", {
    day: day != null ? t("itinerary.dayLabel", { day }) : t("weather.thatDay"),
    pop: pop ?? "–",
  });

  return (
    <div className="mt-2 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-100">
      <p className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
        <Umbrella className="h-3.5 w-3.5" /> {headline}
      </p>
      {options == null ? (
        <div className="skeleton mt-2 h-10 rounded-xl" />
      ) : options.length === 0 ? (
        <p className="mt-1 text-[11px] text-sky-800">{t("weather.noIndoor")}</p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-sky-800">{t("weather.indoorIntro")}</p>
          <ul className="mt-2 space-y-1.5">
            {options.map((o) => {
              const name = o.reel.locationName || o.reel.municipality.name;
              return (
                <li key={o.reel.id} className="flex items-center gap-2 rounded-xl bg-white p-1.5 pr-2">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {o.reel.thumbnailUrl ? (
                      <img src={o.reel.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={`${o.reel.videoUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-jz-ink">{name}</span>
                    <span className="block truncate text-[10px] text-gray-500">
                      {o.why.restaurant ? t("weather.whyRestaurant") : t("weather.whyWord", { word: o.why.word })}・{formatDistance(o.km)}
                    </span>
                  </span>
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => onAdd(o.reel.id)}
                      aria-label={t("weather.add", { place: name })}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jz-red text-white active:scale-90"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
