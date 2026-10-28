import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarPlus, ExternalLink, MapPin, X } from "lucide-react";
import { buildEventIcs, downloadIcs } from "../lib/ics";
import { formatEventDates } from "../lib/eventDates";
import type { EventItem } from "../types";

// The calendar-page style date block used on event cards.
export function EventDateBadge({ date, lang, small = false }: { date: string; lang: string; small?: boolean }) {
  const d = new Date(`${date}T00:00:00`);
  return (
    <span className={`flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 ${small ? "h-12 w-12" : "h-14 w-14"}`}>
      <span className="w-full bg-jz-red py-0.5 text-center text-[10px] font-bold text-white">
        {d.toLocaleDateString(lang, { month: "short" })}
      </span>
      <span className={`font-extrabold tabular-nums text-jz-ink ${small ? "text-lg" : "text-xl"}`}>{d.getDate()}</span>
    </span>
  );
}

// Event details: dates, place, description, the organizer's page, the
// official link and "カレンダーに追加".
export default function EventSheet({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portaled to <body> so no ancestor's stacking context (e.g. the feed
  // hero's `isolate`) can put page content above the sheet.
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:rounded-[28px]"
      >
        <div className="flex items-start gap-3">
          <EventDateBadge date={event.startDate} lang={i18n.language} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug text-jz-ink">{event.title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-jz-red">{formatEventDates(event, i18n.language)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reelViewer.closeLabel")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {event.locationName && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-700">
            <MapPin className="h-4 w-4 shrink-0 text-gray-500" /> {event.locationName}
          </p>
        )}
        {event.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{event.description}</p>}
        <Link to={`/municipalities/${event.municipality.id}`} className="mt-4 block text-xs text-gray-500 hover:underline">
          {t("events.by", { name: event.company?.name ?? event.municipality.name })}
        </Link>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadIcs(buildEventIcs(event), `jaziba-event-${event.startDate}.ics`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-jz-red px-4 py-2.5 text-sm font-bold text-white active:scale-95"
          >
            <CalendarPlus className="h-4 w-4" /> {t("itinerary.addToCalendar")}
          </button>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-semibold text-jz-ink hover:bg-gray-200"
            >
              {t("events.officialSite")} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
