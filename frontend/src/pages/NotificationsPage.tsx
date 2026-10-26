import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { notifyNotificationsRead } from "../lib/unreadNotifications";

interface NotificationItem {
  id: string;
  type: "like" | "comment";
  actorName: string | null;
  reel: { id: string; caption: string; locationName: string | null };
  commentBody: string | null;
  read: boolean;
  createdAt: string;
}

// お知らせ: likes and comments on this account's posts (GET /notifications).
// Opening the page marks everything read; items that were unread on arrival
// stay highlighted for this visit.
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    api
      .get<{ items: NotificationItem[] }>("/notifications")
      .then(({ data }) => {
        setItems(data.items);
        if (data.items.some((n) => !n.read)) {
          void api.post("/notifications/read-all").then(notifyNotificationsRead);
        }
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-8">
      <h1 className="text-lg font-bold text-gray-900">🔔 {t("notifications.heading")}</h1>
      <p className="mt-1 text-xs text-gray-400">{t("notifications.subtitle")}</p>

      {items == null ? (
        <p className="mt-6 text-sm text-gray-400">{t("feed.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          {t("notifications.empty")}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                to={`/reels/${n.reel.id}/access`}
                className={`block rounded-xl border p-3 hover:border-teal-300 ${
                  n.read ? "border-gray-200 bg-white" : "border-teal-200 bg-teal-50"
                }`}
              >
                <p className="text-sm text-gray-800">
                  {n.type === "like" ? "❤️ " : "💬 "}
                  {t(n.type === "like" ? "notifications.liked" : "notifications.commented", {
                    name: n.actorName ?? t("notifications.deletedUser"),
                    post: n.reel.locationName || n.reel.caption.slice(0, 20),
                  })}
                </p>
                {n.commentBody && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-gray-600">「{n.commentBody}」</p>
                )}
                <p className="mt-1 text-[11px] text-gray-400">{new Date(n.createdAt).toLocaleString(i18n.language)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
