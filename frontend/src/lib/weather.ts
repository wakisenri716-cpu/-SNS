// 天気予報 helpers for the しおり (see components/TripWeather.tsx).

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export interface DayForecast {
  date: string;
  code: number;
  kind: WeatherKind;
  tMax: number | null;
  tMin: number | null;
  pop: number | null;
}

export interface IndoorOption {
  km: number;
  why: { restaurant: boolean; word: string | null };
  reel: {
    id: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    category: string;
    locationName: string | null;
    municipality: { name: string; prefecture: string };
  };
}

export const WEATHER_EMOJI: Record<WeatherKind, string> = {
  clear: "☀️",
  partly: "🌤️",
  cloudy: "☁️",
  fog: "🌫️",
  drizzle: "🌦️",
  rain: "🌧️",
  snow: "❄️",
  thunder: "⛈️",
};

// Forecasts reach 16 days ahead (today + 15).
const AHEAD_DAYS = 15;
// A trip that started up to two weeks ago may still be going on.
const BEHIND_DAYS = 13;

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-03" + 2 → "2026-11-05" (calendar days, no time zone surprises). */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

/** Whether a trip starting on `startDate` can be shown with a forecast now. */
export function forecastWindow(startDate: string, now = new Date()): "past" | "inRange" | "tooFar" {
  const today = localDate(now);
  if (startDate > addDays(today, AHEAD_DAYS)) return "tooFar";
  if (startDate < addDays(today, -BEHIND_DAYS)) return "past";
  return "inRange";
}
