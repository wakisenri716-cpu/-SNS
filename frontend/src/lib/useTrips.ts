import { useEffect, useState } from "react";
import { onSavesChanged } from "./savesChanged";
import { listTrips, type TripSummary } from "./trips";

// The signed-in traveler's trips, newest-touched first, kept fresh as posts
// are put in or taken out. Pass enabled=false for anyone else (the request
// needs a traveler session).
export function useTrips(enabled = true) {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const load = () => listTrips().then(setTrips).catch(() => setTrips((prev) => prev ?? []));
    void load();
    return onSavesChanged(() => void load());
  }, [enabled]);
  return trips;
}
