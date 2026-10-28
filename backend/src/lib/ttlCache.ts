// A small in-memory cache for async lookups (per server instance): results
// are kept for `ttlMs`, concurrent calls for the same key share one request,
// failures aren't cached, and the oldest entries go once `maxEntries` is hit.
export function ttlCache<T>(ttlMs: number, maxEntries: number) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();
  return {
    get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
      const hit = entries.get(key);
      if (hit && hit.expires > now) return hit.value;
      entries.delete(key);
      const value = load();
      entries.set(key, { expires: now + ttlMs, value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
      return value;
    },
    get size() {
      return entries.size;
    },
  };
}
