import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { REEL_CATEGORIES, type Reel } from "../types";

const TABS = ["all", ...REEL_CATEGORIES] as const;
type Tab = (typeof TABS)[number];

export default function FeedPage() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("all");
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get("/reels", { params: tab === "all" ? {} : { category: tab } })
      .then(({ data }) => setReels(data.items))
      .finally(() => setLoading(false));
  }, [token, tab]);

  async function toggleLike(reel: Reel) {
    if (!token) return;
    if (reel.likedByMe) {
      await api.delete(`/reels/${reel.id}/like`);
    } else {
      await api.post(`/reels/${reel.id}/like`);
    }
    setReels((prev) =>
      prev.map((r) =>
        r.id === reel.id
          ? { ...r, likedByMe: !r.likedByMe, likeCount: r.likeCount + (r.likedByMe ? -1 : 1) }
          : r
      )
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3">
        {TABS.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === c ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t(`category.${c}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="p-10 text-center text-gray-400">{t("feed.loading")}</p>
      ) : reels.length === 0 ? (
        <p className="m-6 rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          {t("feed.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-3">
          {reels.map((reel) => (
            <ReelThumb key={reel.id} reel={reel} onOpen={(r) => setOpenReelId(r.id)} />
          ))}
        </div>
      )}

      {openReelId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openReelId}
          onClose={() => setOpenReelId(null)}
          onToggleLike={toggleLike}
        />
      )}
    </div>
  );
}
