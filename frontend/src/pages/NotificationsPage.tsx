import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { notifyNotificationsRead } from "../lib/unreadNotifications";
import { Clapperboard, Heart, MessageCircle } from "lucide-react";

interface NotificationItem {
  id: string;
  type: "like" | "comment" | "newPost";
  actorName: string | null;
  posterName: string;
  reel: { id: string; caption: string; locationName: string | null; videoUrl: string };
  commentBody: string | null;
  read: boolean;
  createdAt: string;
}

// お知らせ: likes and comments on this account's posts, or — for travelers —
// new posts from the municipalities/companies they follow (GET /notifications).
// Opening the page marks everything read; items that were unread on arrival
// stay highlighted for this visit.
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
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
      <h1 className="text-xl font-bold text-gray-900">{t("notifications.heading")}</h1>
      <p className="mt-1 text-xs text-gray-400">{t(user?.role === "USER" ? "notifications.subtitleTraveler" : "notifications.subtitle")}</p>

      {items == null ? (
        <p className="mt-6 text-sm text-gray-400">{t("feed.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          {t("notifications.empty")}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                to={`/reels/${n.reel.id}/access`}
                className="flex gap-3 border-b border-gray-100 py-3.5 hover:bg-gray-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  {n.type === "like" ? (
                    <Heart className="h-5 w-5 fill-jz-red text-jz-red" />
                  ) : n.type === "newPost" ? (
                    <Clapperboard className="h-5 w-5 text-jz-red" />
                  ) : (
                    <MessageCircle className="h-5 w-5 text-gray-900" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                <p className={`text-sm text-gray-900 ${n.read ? "" : "font-semibold"}`}>
                  {n.type === "newPost"
                    ? t("notifications.newPost", { name: n.posterName, post: n.reel.locationName || n.reel.caption.slice(0, 20) })
                    : t(n.type === "like" ? "notifications.liked" : "notifications.commented", {
                        name: n.actorName ?? t("notifications.deletedUser"),
                        post: n.reel.locationName || n.reel.caption.slice(0, 20),
                      })}
                </p>
                {n.commentBody && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-gray-600">「{n.commentBody}」</p>
                )}
                <p className="mt-1 text-[11px] text-gray-400">{new Date(n.createdAt).toLocaleString(i18n.language)}</p>
                </span>
                {n.type === "newPost" && (
                  <video
                    src={`${n.reel.videoUrl}#t=0.1`}
                    className="on-media h-14 w-11 shrink-0 rounded-lg bg-gray-100 object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-jz-red" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
