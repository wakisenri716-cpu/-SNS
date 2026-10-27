import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { useReelActions } from "../lib/useReelActions";
import type { Reel } from "../types";

// リール: the whole feed as full-height vertical video, swiped one by one
// (TikTok/Reels style), loading more as you reach the end.
export default function ReelsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const cursor = useRef<string | null>(null);
  const loadingMore = useRef(false);
  const actions = useReelActions(setReels);

  useEffect(() => {
    api.get("/reels").then(({ data }) => {
      setReels(data.items);
      cursor.current = data.nextCursor ?? null;
      setLoaded(true);
    });
  }, [token]);

  function loadMore() {
    if (!cursor.current || loadingMore.current) return;
    loadingMore.current = true;
    api
      .get("/reels", { params: { cursor: cursor.current } })
      .then(({ data }) => {
        setReels((prev) => [...prev, ...data.items.filter((r: Reel) => !prev.some((p) => p.id === r.id))]);
        cursor.current = data.nextCursor ?? null;
      })
      .finally(() => (loadingMore.current = false));
  }

  return (
    // Phones: a rounded panel between the top bar and the floating tab bar.
    <div className="fixed inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] top-[61px] overflow-hidden rounded-[28px] bg-black md:relative md:inset-auto md:mx-auto md:my-4 md:h-[calc(100vh-2rem)] md:max-w-[min(100%,calc((100vh-2rem)*9/16))]">
      {!loaded ? (
        <div className="skeleton h-full w-full" />
      ) : reels.length === 0 ? (
        <p className="flex h-full items-center justify-center p-8 text-center text-sm text-white/70">{t("feed.empty")}</p>
      ) : (
        <ReelFullscreenViewer
          embedded
          reels={reels}
          initialId={reels[0].id}
          onClose={() => {}}
          onToggleLike={actions.toggleLike}
          onToggleSave={actions.toggleSave}
          onToggleFollow={actions.toggleFollow}
          onCommentCountChange={actions.setCommentCount}
          onReachEnd={loadMore}
        />
      )}
    </div>
  );
}
