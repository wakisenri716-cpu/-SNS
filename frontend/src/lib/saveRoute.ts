import { api } from "../api/client";
import { localInputToIso } from "./transportTiming";
import { rideDateTimes, type ParsedRoute } from "./transitPaste";

// Save every ride of a route read from 乗換案内 as 乗る便, in one request.
// `fallbackDate` ("YYYY-MM-DD") is used when the text had no date; a ride
// without a line name is saved under its kind ("電車").
export function routeComplete(route: ParsedRoute) {
  return route.rides.length > 0 && route.rides.every((r) => r.fromName && r.toName && r.depart);
}

export async function saveRoute(tripId: string, route: ParsedRoute, fallbackDate: string, kindLabel: (kind: string) => string) {
  const times = rideDateTimes(route.date ?? fallbackDate, route.rides);
  const items = route.rides.map((r, i) => ({
    kind: r.kind,
    name: r.name || kindLabel(r.kind),
    fromName: r.fromName,
    toName: r.toName,
    departAt: localInputToIso(times[i].departAt),
    arriveAt: localInputToIso(times[i].arriveAt),
    departPlatform: r.departPlatform,
    arrivePlatform: r.arrivePlatform,
  }));
  await api.post(`/me/trips/${tripId}/transports/batch`, { items });
  return items.length;
}

export function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
