// Shared by both access-plan endpoints. Expects a full ISO 8601 timestamp
// (with an explicit UTC offset, e.g. from Date.prototype.toISOString()) —
// the frontend converts its <input type="datetime-local"> value (which has
// no timezone of its own) to that in the browser before sending it, so this
// never has to guess which timezone a bare "YYYY-MM-DDTHH:mm" string means.
export function parseDepartureTime(raw: unknown): Date {
  if (typeof raw === "string" && raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
