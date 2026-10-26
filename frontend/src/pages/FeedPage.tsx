import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { fetchSavedReelIds, notifySavesChanged, onSavesChanged } from "../lib/savesChanged";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import CommentsSheet from "../components/CommentsSheet";
import FeedPost from "../components/FeedPost";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import WelcomeIntro from "../components/WelcomeIntro";
import { REEL_CATEGORIES, type Reel } from "../types";

const CATEGORY_TABS = ["all", ...REEL_CATEGORIES] as const;
const SPECIAL_TABS = ["saved", "following"] as const;
type Tab = (typeof CATEGORY_TABS)[number] | (typeof SPECIAL_TABS)[number];

// saved/following return everything at once; the main feed is paged by cursor.
function feedRequest(tab: Tab, cursor?: string) {
  if (tab === "saved") return api.get("/reels/saved");
  if (tab === "following") return api.get("/reels/following");
  return api.get("/reels", {
    params: { ...(tab === "all" ? {} : { category: tab }), ...(cursor ? { cursor } : {}) },
  });
}

export default function FeedPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReelId, setOpenReelId] = useState<string | null>(null);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [personalized, setPersonalized] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Bumped on every tab/login change so responses for a previous list are dropped.
  const listVersion = useRef(0);

  useEffect(() => {
    const version = ++listVersion.current;
    setLoading(true);
    setNextCursor(null);
    feedRequest(tab)
      .then(({ data }) => {
        if (version !== listVersion.current) return;
        setReels(data.items);
        setPersonalized(!!data.personalized);
        setNextCursor(data.nextCursor ?? null);
      })
      .finally(() => version === listVersion.current && setLoading(false));
  }, [token, tab]);

  // Infinite scroll: fetch the next page when the sentinel below the grid
  // comes near the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        const version = listVersion.current;
        setLoadingMore(true);
        feedRequest(tab, nextCursor)
          .then(({ data }) => {
            if (version !== listVersion.current) return;
            setReels((prev) => [...prev, ...data.items.filter((r: Reel) => !prev.some((p) => p.id === r.id))]);
            setNextCursor(data.nextCursor ?? null);
          })
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, tab]);

  // Keep savedByMe in sync when a save/unsave happens elsewhere (e.g. removing
  // a stop from the しおり), so the save button doesn't act on a stale state.
  useEffect(() => {
    if (!token) return;
    return onSavesChanged(async () => {
      const ids = await fetchSavedReelIds();
      setReels((prev) =>
        tab === "saved" ? prev.filter((r) => ids.has(r.id)) : prev.map((r) => ({ ...r, savedByMe: ids.has(r.id) }))
      );
    });
  }, [token, tab]);

  async function toggleLike(reel: Reel) {
    if (!token) return navigate("/login");
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
    if (!token) return navigate("/login");
    if (reel.savedByMe) {
      await api.delete(`/reels/${reel.id}/save`);
    } else {
      await api.post(`/reels/${reel.id}/save`);
    }
    notifySavesChanged();
    setReels((prev) => {
      const next = prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: !r.savedByMe } : r));
      // Unsaving while viewing the "saved" tab should drop it from view immediately.
      return tab === "saved" ? next.filter((r) => r.savedByMe) : next;
    });
  }

  async function toggleFollow(reel: Reel) {
    if (!token) return navigate("/login");
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

  function setCommentCount(reelId: string, count: number) {
    setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, commentCount: count } : r)));
  }

  // Story-style row of the municipalities appearing in this feed, in order.
  const stories = reels
    .map((r) => r.municipality)
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .slice(0, 20);

  return (
    <div className="mx-auto w-full max-w-[630px]">
      <WelcomeIntro />

      {stories.length > 0 && (
        <nav aria-label={t("feed.storiesLabel")} className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 pt-4 md:pt-8">
          {stories.map((m) => (
            <Link key={m.id} to={`/municipalities/${m.id}`} className="flex w-[66px] shrink-0 flex-col items-center gap-1.5">
              <Avatar name={m.name} src={m.avatarUrl} size={58} ring />
              <span className="w-full truncate text-center text-xs text-gray-900">{m.name}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="sticky top-[53px] z-30 border-b border-gray-200 bg-white/95 backdrop-blur-xl md:top-0">
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-2.5">
          {[...CATEGORY_TABS, ...(token ? SPECIAL_TABS : [])].map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              aria-pressed={tab === c}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === c ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900 hover:bg-gray-200"
              }`}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === "all" && user?.role === "USER" && !loading && (
        <p className="flex flex-wrap items-center gap-x-2 border-b border-gray-200 px-4 py-2.5 text-xs text-gray-500">
          <span>{personalized ? t("feed.personalizedNote") : t("feed.personalizeCta")}</span>
          <Link to="/settings#travel-style" className="font-semibold text-[#0095f6] hover:text-[#00376b]">
            {personalized ? t("feed.personalizedChange") : t("feed.personalizeSet")}
          </Link>
        </p>
      )}

      {loading ? (
        <p className="p-10 text-center text-sm text-gray-400">{t("feed.loading")}</p>
      ) : reels.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-gray-500">
          {tab === "saved" ? t("feed.emptySaved") : tab === "following" ? t("feed.emptyFollowing") : t("feed.empty")}
        </p>
      ) : (
        <div className="mx-auto max-w-[470px] pb-6 md:pt-4">
          {reels.map((reel) => (
            <FeedPost
              key={reel.id}
              reel={reel}
              onOpen={(r) => setOpenReelId(r.id)}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onToggleFollow={toggleFollow}
              onOpenComments={(r) => setCommentsReelId(r.id)}
            />
          ))}
        </div>
      )}
      <div ref={sentinelRef} />
      {loadingMore && <p className="p-4 text-center text-xs text-gray-400">{t("feed.loading")}</p>}

      {openReelId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openReelId}
          onClose={() => setOpenReelId(null)}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollow}
          onCommentCountChange={setCommentCount}
        />
      )}
      {commentsReelId && (
        <CommentsSheet
          reelId={commentsReelId}
          onClose={() => setCommentsReelId(null)}
          onCountChange={(count) => setCommentCount(commentsReelId, count)}
        />
      )}
    </div>
  );
}
