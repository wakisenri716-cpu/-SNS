// Builds an iCalendar (.ics) file for the しおり so it can be added to
// Google/Apple/Outlook calendars, and downloads it.
export interface CalendarStop {
  title: string;
  location: string;
  lat: number;
  lng: number;
  url: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function localStamp(date: string, minutes: number) {
  // date is YYYY-MM-DD; minutes may run past midnight.
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(minutes);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export function buildItineraryIcs(date: string, stops: CalendarStop[], now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const events = stops.map((s, i) =>
    [
      "BEGIN:VEVENT",
      `UID:jaziba-${date}-${i}-${Math.random().toString(36).slice(2)}@jaziba.jp`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tokyo:${localStamp(date, s.start)}`,
      `DTEND;TZID=Asia/Tokyo:${localStamp(date, s.end)}`,
      `SUMMARY:${escapeText(s.title)}`,
      `LOCATION:${escapeText(s.location)}`,
      `GEO:${s.lat};${s.lng}`,
      `URL:${s.url}`,
      `DESCRIPTION:${escapeText(s.url)}`,
      "END:VEVENT",
    ].join("\r\n")
  );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jaziba//Itinerary//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadItineraryIcs(date: string, stops: CalendarStop[], fileName: string) {
  downloadIcs(buildItineraryIcs(date, stops), fileName);
}

// One all-day (possibly multi-day) event, e.g. a festival.
export function buildEventIcs(
  event: { title: string; description: string; startDate: string; endDate: string; locationName: string; url: string },
  now = new Date()
) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const day = (iso: string, plus = 0) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + plus);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jaziba//Event//JA",
    "BEGIN:VEVENT",
    `UID:jaziba-event-${day(event.startDate)}-${Math.random().toString(36).slice(2)}@jaziba.jp`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(event.startDate)}`,
    // DTEND is exclusive for all-day events.
    `DTEND;VALUE=DATE:${day(event.endDate, 1)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.locationName ? [`LOCATION:${escapeText(event.locationName)}`] : []),
    ...(event.description || event.url ? [`DESCRIPTION:${escapeText([event.description, event.url].filter(Boolean).join("\n"))}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(ics: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
