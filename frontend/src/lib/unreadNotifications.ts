import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";

const POLL_MS = 60_000;
const READ_EVENT = "jaziba:notifications-read";

export function notifyNotificationsRead() {
  window.dispatchEvent(new Event(READ_EVENT));
}

// Unread お知らせ count for the menu badge: refreshed on every page change,
// once a minute, and right after the お知らせ page marks everything read.
export function useUnreadNotificationCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () =>
      api
        .get<{ count: number }>("/notifications/unread-count")
        .then(({ data }) => !cancelled && setCount(data.count))
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener(READ_EVENT, refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(READ_EVENT, refresh);
    };
  }, [enabled, pathname]);

  return count;
}
