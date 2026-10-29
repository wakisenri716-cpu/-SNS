import { ttlCache } from "../lib/ttlCache";

// 天気予報 for the しおり: the daily forecast (up to 16 days ahead) at each
// day's first stop, from Open-Meteo (no key needed; data CC BY 4.0, credited
// in the UI). Open-Meteo's free API is for non-commercial use — for a
// commercial launch set OPEN_METEO_API_KEY (their paid plan), which switches
// to the customer endpoint. Forecasts are cached for an hour per ~10 km cell.

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export interface DayForecast {
  date: string;
  code: number;
  kind: WeatherKind;
  tMax: number | null;
  tMin: number | null;
  /** Chance of rain that day, %. */
  pop: number | null;
}

export const FORECAST_DAYS = 16;

// WMO weather interpretation codes, as Open-Meteo reports them.
export function kindOf(code: number): WeatherKind {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

// A day worth planning around: rain, snow or storms, or a high chance of rain.
export function isWetDay(f: DayForecast) {
  return f.kind === "rain" || f.kind === "snow" || f.kind === "thunder" || (f.pop ?? 0) >= 60;
}

const cache = ttlCache<Map<string, DayForecast>>(60 * 60 * 1000, 500);

async function fetchForecast(lat: number, lng: number): Promise<Map<string, DayForecast>> {
  const key = process.env.OPEN_METEO_API_KEY;
  const url = new URL(key ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lng.toFixed(2),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Tokyo",
    forecast_days: String(FORECAST_DAYS),
    ...(key ? { apikey: key } : {}),
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const body = (await res.json()) as {
    daily?: {
      time: string[];
      weather_code: (number | null)[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      precipitation_probability_max: (number | null)[];
    };
  };
  const daily = body.daily;
  if (!daily?.time) throw new Error("open-meteo: no daily data");
  const days = new Map<string, DayForecast>();
  daily.time.forEach((date, i) => {
    const code = daily.weather_code[i];
    if (code == null) return;
    const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
    days.set(date, {
      date,
      code,
      kind: kindOf(code),
      tMax: round(daily.temperature_2m_max[i]),
      tMin: round(daily.temperature_2m_min[i]),
      pop: round(daily.precipitation_probability_max[i]),
    });
  });
  return days;
}

// The forecast for one place on one date, or null when that date is outside
// the forecast range (or the service didn't answer).
export async function forecastAt(lat: number, lng: number, date: string): Promise<DayForecast | null> {
  const cell = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  try {
    const days = await cache.get(cell, () => fetchForecast(Number(lat.toFixed(1)), Number(lng.toFixed(1))));
    return days.get(date) ?? null;
  } catch (err) {
    console.warn("[weather] forecast unavailable:", (err as Error).message);
    return null;
  }
}
