import type { EventItem } from "../types";

// "11月3日(月)" or "11月3日(月) 〜 11月5日(水)" in the viewer's language.
export function formatEventDates(e: Pick<EventItem, "startDate" | "endDate">, lang: string) {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang, { month: "long", day: "numeric", weekday: "short" });
  return e.startDate === e.endDate ? fmt(e.startDate) : `${fmt(e.startDate)} 〜 ${fmt(e.endDate)}`;
}
