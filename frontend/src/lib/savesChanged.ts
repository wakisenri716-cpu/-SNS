import { api } from "../api/client";

// Fired after any bookmark (save/unsave) so the しおり, which lives in the
// layout and otherwise only loads once, can refresh itself.
const EVENT = "jaziba:saves-changed";

export function notifySavesChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function onSavesChanged(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// Ids of everything the signed-in user has saved — lets a page holding its own
// copy of reels re-sync `savedByMe` after a save/unsave made elsewhere.
export async function fetchSavedReelIds(): Promise<Set<string>> {
  const { data } = await api.get<{ items: { id: string }[] }>("/reels/saved");
  return new Set(data.items.map((r) => r.id));
}
