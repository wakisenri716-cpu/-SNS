import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export interface TripPerson {
  id: string;
  name: string;
}

// 共同編集のライブ for one trip's しおり: who has it open right now, and a
// callback when someone changes it (GET /api/trips/live/:ticket, after a
// one-time ticket from POST /me/trips/:id/live-ticket — EventSource can't
// send the session header). Reconnects with a fresh ticket after errors;
// disconnects while the tab is hidden.
export function useTripLive(tripId: string, onChanged: (by: TripPerson) => void, enabled = true) {
  const [people, setPeople] = useState<TripPerson[]>([]);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let retry: number | undefined;
    let stopped = false;

    const disconnect = () => {
      source?.close();
      source = null;
      window.clearTimeout(retry);
    };
    const connect = async () => {
      if (stopped || source || document.visibilityState === "hidden") return;
      try {
        const { data } = await api.post<{ ticket: string }>(`/me/trips/${tripId}/live-ticket`);
        if (stopped) return;
        const es = new EventSource(`/api/trips/live/${data.ticket}`);
        source = es;
        es.addEventListener("presence", (e) => setPeople((JSON.parse((e as MessageEvent).data) as { people: TripPerson[] }).people));
        es.addEventListener("changed", (e) => onChangedRef.current((JSON.parse((e as MessageEvent).data) as { by: TripPerson }).by));
        // The ticket is single-use, so a dropped stream needs a new one.
        es.onerror = () => {
          es.close();
          if (source === es) source = null;
          retry = window.setTimeout(() => void connect(), 5_000);
        };
      } catch {
        retry = window.setTimeout(() => void connect(), 15_000);
      }
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? disconnect() : void connect());
    void connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
      setPeople([]);
    };
  }, [tripId, enabled]);

  return people;
}
