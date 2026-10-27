import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { fetchSavedReelIds, notifySavesChanged, onSavesChanged } from "../lib/savesChanged";
import { useAuth } from "../auth/AuthContext";
import { showToast } from "../lib/toast";
import { isOnScreen, withViewTransition } from "../lib/viewTransition";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import Avatar from "../components/Avatar";
import CommentsSheet from "../components/CommentsSheet";
import FeedPost from "../components/FeedPost";
import FeedSkeleton from "../components/FeedSkeleton";
import StoryViewer, { type StoryGroup } from "../components/StoryViewer";
import { useSeenStories } from "../lib/storiesSeen";
import ConciergeButton from "../components/ConciergeButton";
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
  // Reel whose card/slide carries the shared name during an open/close morph.
  const [heroId, setHeroId] = useState<string | null>(null);
  // Stories being watched: the groups as ordered when opened, so the row
  // re-sorting as posts become "seen" doesn't shift the viewer.
  const [storyView, setStoryView] = useState<{ groups: StoryGroup[]; start: number } | null>(null);
  const seenStories = useSeenStories();
  const [personalized, setPersonalized] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Bumped on every tab/login change so responses for a previous list are dropped.
  const listVersion = useRef(0);
  // Pull-to-refresh reloads the list in place (no skeleton) while the dot pulses.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const { pull, progress } = usePullToRefresh(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  });

  useEffect(() => {
    const version = ++listVersion.current;
    if (!refreshingRef.current) setLoading(true);
    setNextCursor(null);
    feedRequest(tab)
      .then(({ data }) => {
        if (version !== listVersion.current) return;
        setReels(data.items);
        setPersonalized(!!data.personalized);
        setNextCursor(data.nextCursor ?? null);
      })
      .finally(() => {
        if (version !== listVersion.current) return;
        setLoading(false);
        refreshingRef.current = false;
        setRefreshing(false);
      });
  }, [token, tab, refreshKey]);

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
    if (!reel.savedByMe) showToast(t("feed.savedToast"), { label: t("feed.savedToastAction"), to: "/itinerary" });
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

  function openViewer(reel: Reel) {
    flushSync(() => setHeroId(reel.id));
    void withViewTransition(() => setOpenReelId(reel.id)).then(() => setHeroId(null));
  }

  function closeViewer(currentId: string) {
    // Morph back only into a card that's actually on screen.
    const card = document.querySelector(`[data-reel-id="${currentId}"]`);
    if (!isOnScreen(card)) return setOpenReelId(null);
    flushSync(() => setHeroId(currentId));
    void withViewTransition(() => setOpenReelId(null)).then(() => setHeroId(null));
  }

  function setCommentCount(reelId: string, count: number) {
    setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, commentCount: count } : r)));
  }

  // Stories: the feed's posts grouped by municipality, ones with unwatched
  // posts first (each group keeps feed order).
  const storyGroups: StoryGroup[] = [];
  for (const r of reels) {
    const group = storyGroups.find((sg) => sg.municipality.id === r.municipality.id);
    if (group) group.reels.push(r);
    else storyGroups.push({ municipality: r.municipality, reels: [r] });
  }
  const isGroupSeen = (sg: StoryGroup) => sg.reels.every((r) => seenStories.has(r.id));
  const stories = [...storyGroups.filter((sg) => !isGroupSeen(sg)), ...storyGroups.filter(isGroupSeen)].slice(0, 20);

  return (
    <div className="mx-auto w-full max-w-[560px] md:px-4">
      {/* Pull-to-refresh indicator: the logo's red dot grows as you pull and pulses while loading. */}
      <div
        className="flex items-end justify-center overflow-hidden md:hidden"
        style={{ height: refreshing ? 48 : pull, transition: pull ? "none" : "height 0.3s ease" }}
        aria-hidden={!refreshing}
        role="status"
      >
        <span className="relative mb-3 flex h-4 w-4 items-center justify-center">
          {refreshing && <span className="absolute h-4 w-4 animate-ping rounded-full bg-jz-red opacity-60" />}
          <span
            className="h-3 w-3 rounded-full bg-jz-red"
            style={{ transform: `scale(${refreshing ? 1 : 0.3 + progress * 0.9})`, opacity: refreshing ? 1 : 0.4 + progress * 0.6 }}
          />
        </span>
      </div>
      <WelcomeIntro />

      <div className="relative isolate">
        <div className="aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      <h1 className="px-4 pt-5 text-[26px] font-extrabold leading-tight tracking-tight text-jz-ink md:px-0 md:pt-8">
        {t("feed.heroTitle")}
        <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-jz-red align-baseline" aria-hidden />
      </h1>
      <div className="px-3 pt-3 md:px-0">
        <ConciergeButton />
      </div>
      </div>
      {stories.length > 0 && (
        <nav aria-label={t("feed.storiesLabel")} className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 pt-3 md:px-0">
          {stories.map((sg, idx) => (
            <button
              key={sg.municipality.id}
              type="button"
              onClick={() => setStoryView({ groups: stories, start: idx })}
              className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
            >
              <Avatar name={sg.municipality.name} src={sg.municipality.avatarUrl} size={62} ring spin seen={isGroupSeen(sg)} />
              <span className={`w-full truncate text-center text-xs ${isGroupSeen(sg) ? "text-gray-500" : "text-gray-900"}`}>
                {sg.municipality.name}
              </span>
            </button>
          ))}
        </nav>
      )}

      <div className="sticky top-[var(--header-offset,53px)] z-30 bg-white/80 backdrop-blur-xl backdrop-saturate-150 transition-[top] duration-300 md:top-0">
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-2.5">
          {[...CATEGORY_TABS, ...(token ? SPECIAL_TABS : [])].map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              aria-pressed={tab === c}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
                tab === c ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900 hover:bg-gray-200"
              }`}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === "all" && user?.role === "USER" && !loading && (
        <Link
          to="/settings#travel-style"
          className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-jz-tint px-4 py-3 text-xs text-jz-ink transition active:scale-[0.99] md:mx-0"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-jz-red" />
          <span className="min-w-0 flex-1 leading-relaxed">
            {personalized ? t("feed.personalizedNote") : t("feed.personalizeCta")}
          </span>
          <span className="flex shrink-0 items-center font-bold text-jz-red">
            {personalized ? t("feed.personalizedChange") : t("feed.personalizeSet")}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {loading ? (
        <div className="pt-2 md:pt-4">
          <FeedSkeleton />
        </div>
      ) : reels.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-gray-500">
          {tab === "saved" ? t("feed.emptySaved") : tab === "following" ? t("feed.emptyFollowing") : t("feed.empty")}
        </p>
      ) : (
        <div className="pb-6 pt-3">
          {reels.map((reel) => (
            <FeedPost
              key={reel.id}
              reel={reel}
              heroName={heroId === reel.id && !openReelId ? "reel-hero" : undefined}
              onOpen={openViewer}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onToggleFollow={toggleFollow}
              onOpenComments={(r) => setCommentsReelId(r.id)}
            />
          ))}
        </div>
      )}
      <div ref={sentinelRef} />
      {loadingMore && <FeedSkeleton count={1} />}

      {openReelId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openReelId}
          heroId={heroId}
          onClose={closeViewer}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollow}
          onCommentCountChange={setCommentCount}
        />
      )}
      {storyView && (
        <StoryViewer groups={storyView.groups} startGroup={storyView.start} onClose={() => setStoryView(null)} />
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
