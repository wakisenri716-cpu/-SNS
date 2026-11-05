import { api } from "../api/client";
import { getCurrentTripId, listTrips } from "./trips";

// 予約へ → しおり: the moment a traveller opens a booking page from Jaziba,
// the stay is written into their trip as 手続き中 (楽天トラベル doesn't tell
// Jaziba when a booking is made). When they come back, Jaziba asks whether
// it went through (components/PendingBookingPrompt.tsx); the confirmation
// email, shared or pasted later, fills in the same entry.
const KEY = "jz-pending-booking";
export interface PendingBooking {
  tripId: string;
  tripName: string;
  reservationId: string;
  name: string;
  at: number;
}

export function getPendingBooking(): PendingBooking | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingBooking) : null;
  } catch {
    return null;
  }
}
export function clearPendingBooking() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

const atLocal = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

/** Write the stay into the current (or next) trip as 手続き中. Returns the trip's name, or null (not signed in / no trip). */
export async function recordPendingBooking(b: {
  name: string;
  address: string;
  checkin: string;
  checkout: string;
  adults: number;
  planName: string;
  totalYen: number | null;
  url: string;
}): Promise<string | null> {
  const trips = await listTrips().catch(() => []);
  if (trips.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const trip =
    trips.find((x) => x.id === getCurrentTripId()) ??
    trips.filter((x) => x.startDate && x.startDate >= today).sort((a, c) => a.startDate!.localeCompare(c.startDate!))[0] ??
    trips[0];
  const { data } = await api.post<{ id: string }>(`/me/trips/${trip.id}/reservations`, {
    kind: "lodging",
    status: "pending",
    name: b.name,
    startAt: atLocal(b.checkin, "15:00"),
    endAt: atLocal(b.checkout, "10:00"),
    address: b.address,
    guests: b.adults,
    planName: b.planName,
    priceYen: b.totalYen,
    bookedVia: "楽天トラベル",
    url: b.url,
  });
  try {
    localStorage.setItem(KEY, JSON.stringify({ tripId: trip.id, tripName: trip.name, reservationId: data.id, name: b.name, at: Date.now() } satisfies PendingBooking));
  } catch {
    /* the しおり still shows it as 手続き中 */
  }
  return trip.name;
}
