import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import EventSheet, { EventDateBadge } from "./EventSheet";
import { formatEventDates } from "../lib/eventDates";
import type { EventItem } from "../types";

// 近日のイベント: upcoming and ongoing events as a horizontal row (home), or a
// list for one municipality (profile tab). The home row hides itself when
// there are none.
export default function UpcomingEvents({ municipalityId, layout = "row" }: { municipalityId?: string; layout?: "row" | "list" }) {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [open, setOpen] = useState<EventItem | null>(null);

  useEffect(() => {
    api
      .get<{ items: EventItem[] }>("/events", { params: municipalityId ? { municipalityId } : {} })
      .then(({ data }) => setEvents(data.items))
      .catch(() => setEvents([]));
  }, [municipalityId]);

  if (events == null) return null;
  if (events.length === 0) {
    return layout === "list" ? <p className="px-6 py-12 text-center text-sm text-gray-500">{t("events.empty")}</p> : null;
  }

  const card = (e: EventItem) => (
    <button
      key={e.id}
      type="button"
      onClick={() => setOpen(e)}
      className={`flex items-center gap-3 rounded-2xl bg-gray-50 p-3 text-left transition hover:bg-gray-100 active:scale-[0.98] ${
        layout === "row" ? "w-64 shrink-0" : "w-full"
      }`}
    >
      <EventDateBadge date={e.startDate} lang={i18n.language} small />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-jz-ink">{e.title}</span>
        <span className="block truncate text-[11px] text-gray-500">{formatEventDates(e, i18n.language)}</span>
        <span className="block truncate text-[11px] text-gray-400">
          {e.municipality.name}
          {e.locationName && `・${e.locationName}`}
        </span>
      </span>
    </button>
  );

  return (
    <>
      {layout === "row" ? (
        <section className="pt-4">
          <h2 className="px-4 text-sm font-bold text-jz-ink md:px-0">{t("events.upcoming")}</h2>
          <div className="scrollbar-none mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-0">{events.map(card)}</div>
        </section>
      ) : (
        <div className="flex flex-col gap-2 p-4 lg:p-6">{events.map(card)}</div>
      )}
      {open && <EventSheet event={open} onClose={() => setOpen(null)} />}
    </>
  );
}
