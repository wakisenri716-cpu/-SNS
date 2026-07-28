import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { REEL_CATEGORIES, type Reel } from "../types";

const CATEGORY_TABS = ["all", ...REEL_CATEGORIES] as const;
const SPECIAL_TABS = ["saved", "following"] as const;
type Tab = (typeof CATEGORY_TABS)[number] | (typeof SPECIAL_TABS)[number];

function feedRequest(tab: Tab) {
  if (tab === "saved") return api.get("/reels/saved");
  if (tab === "following") return api.get("/reels/following");
  return api.get("/reels", { params: tab === "all" ? {} : { category: tab } });
}

export default function FeedPage() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("all");
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    feedRequest(tab)
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

  async function toggleSave(reel: Reel) {
    if (!token) return;
    if (reel.savedByMe) {
      await api.delete(`/reels/${reel.id}/save`);
    } else {
      await api.post(`/reels/${reel.id}/save`);
    }
    setReels((prev) => {
      const next = prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: !r.savedByMe } : r));
      // Unsaving while viewing the "saved" tab should drop it from view immediately.
      return tab === "saved" ? next.filter((r) => r.savedByMe) : next;
    });
  }

  async function toggleFollow(reel: Reel) {
    if (!token) return;
    const target = reel.postedByCompany ?? reel.municipality;
    const kind = reel.postedByCompany ? "companies" : "municipalities";
    if (target.isFollowing) {
      await api.delete(`/${kind}/${target.id}/follow`);
    } else {
      await api.post(`/${kind}/${target.id}/follow`);
    }
    setReels((prev) => {
      const next = prev.map((r) => {
        const rTarget = r.postedByCompany ?? r.municipality;
        if (rTarget.id !== target.id) return r;
        return r.postedByCompany
          ? { ...r, postedByCompany: { ...r.postedByCompany, isFollowing: !target.isFollowing } }
          : { ...r, municipality: { ...r.municipality, isFollowing: !target.isFollowing } };
      });
      return tab === "following" && target.isFollowing ? next.filter((r) => (r.postedByCompany ?? r.municipality).id !== target.id) : next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3">
        {CATEGORY_TABS.map((c) => (
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
        {token &&
          SPECIAL_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tab === s ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t(`category.${s}`)}
            </button>
          ))}
      </div>

      {loading ? (
        <p className="p-10 text-center text-gray-400">{t("feed.loading")}</p>
      ) : reels.length === 0 ? (
        <p className="m-6 rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          {tab === "saved" ? t("feed.emptySaved") : tab === "following" ? t("feed.emptyFollowing") : t("feed.empty")}
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
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollow}
        />
      )}
    </div>
  );
}
