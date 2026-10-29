// 最近見た: the last few spots this device opened (their access page), kept
// only in this browser's storage — never sent anywhere. A small snapshot is
// stored so the row can draw without asking the server.
export interface RecentItem {
  id: string;
  videoUrl: string;
  place: string;
  municipality: string;
}

const KEY = "jaziba-recently-viewed";
const MAX = 12;

export function getRecentlyViewed(): RecentItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.id === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

// Newest first, each spot once.
export function addRecentlyViewed(item: RecentItem, existing = getRecentlyViewed()) {
  const next = [item, ...existing.filter((x) => x.id !== item.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: history just isn't kept.
  }
  return next;
}

export function clearRecentlyViewed() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
