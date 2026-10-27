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
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function localStamp(date: string, minutes: number) {
  // date is YYYY-MM-DD; minutes may run past midnight.
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(minutes);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export function downloadItineraryIcs(date: string, stops: CalendarStop[], fileName: string) {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const events = stops.map((s, i) =>
    [
      "BEGIN:VEVENT",
      `UID:jaziba-${date}-${i}-${Math.random().toString(36).slice(2)}@jaziba.jp`,
      `DTSTAMP:${now}`,
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
  const ics = [
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
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
