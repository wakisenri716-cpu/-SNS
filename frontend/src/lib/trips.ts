import { api } from "../api/client";
import { notifySavesChanged } from "./savesChanged";

// 旅 (trips): a traveler makes them first and puts posts into them; each
// is its own しおり (backend routes/myTrips.ts).
export interface TripSummary {
  id: string;
  name: string;
  startDate: string | null;
  count: number;
  coverVideoUrl: string | null;
  updatedAt: string;
  /** Only when listed for one post (?reel=): whether it's in this trip. */
  containsReel?: boolean;
  /** Joined trips (共同編集) aren't yours: whose they are and how many plan it. */
  isOwner: boolean;
  ownerName: string;
  people: number;
}

export async function listTrips(reelId?: string) {
  const { data } = await api.get<{ items: TripSummary[] }>("/me/trips", { params: reelId ? { reel: reelId } : {} });
  return data.items;
}

// `items` fills it right away, in order (used by "AIで旅をつくる").
export async function createTrip(name: string, startDate?: string | null, items?: { reelId: string; stayMinutes: number }[]) {
  const { data } = await api.post<TripSummary>("/me/trips", { name, ...(startDate ? { startDate } : {}), ...(items ? { items } : {}) });
  return data;
}

export async function addToTrip(tripId: string, reelId: string) {
  await api.put(`/me/trips/${tripId}/items/${reelId}`);
  notifySavesChanged();
}

export async function removeFromTrip(tripId: string, reelId: string) {
  await api.delete(`/me/trips/${tripId}/items/${reelId}`);
  notifySavesChanged();
}

// The trip the しおり rail/page shows by default (remembered per device).
const CURRENT_KEY = "jaziba-current-trip";
export function getCurrentTripId() {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}
export function setCurrentTripId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Not remembered; harmless.
  }
}

// "どの旅に入れる？": opens the sheet (rendered by <TripPickerHost/> in the
// layout) for one post, or for several to add at once. Resolves when it
// closes — for one post, with whether it's now in any trip.
export interface TripPickerRequest {
  reelIds: string[];
  title: string;
  resolve: (savedInAnyTrip: boolean) => void;
}
const EVENT = "jaziba:trip-picker";

export function chooseTrips(reelIds: string[], title: string) {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<TripPickerRequest>(EVENT, { detail: { reelIds, title, resolve } }));
  });
}

export function onTripPicker(handler: (req: TripPickerRequest) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<TripPickerRequest>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
