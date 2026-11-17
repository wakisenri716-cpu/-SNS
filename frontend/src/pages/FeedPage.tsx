import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUp, ChevronRight, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { fetchSavedReelIds, onSavesChanged } from "../lib/savesChanged";
import { useAuth } from "../auth/AuthContext";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { useNewPosts } from "../lib/useNewPosts";
import { chooseTrips } from "../lib/trips";
import { currentPosition, distanceKm } from "../lib/geo";
import Avatar from "../components/Avatar";
import StoryViewer, { type StoryGroup } from "../components/StoryViewer";
import { useSeenStories } from "../lib/storiesSeen";
import ConciergeButton from "../components/ConciergeButton";
import UpcomingEvents from "../components/UpcomingEvents";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import WelcomeIntro from "../components/WelcomeIntro";
import RecommendGrid from "../components/RecommendGrid";
import type { Pools } from "../lib/gridRotation";
import { REEL_CATEGORIES, type Reel } from "../types";

// "season" = 今が見頃: posts whose poster-set best months include this month.
const CATEGORY_TABS = ["all", "nearby", "season", ...REEL_CATEGORIES] as const;
const SPECIAL_TABS = ["saved", "following"] as const;
type Tab = (typeof CATEGORY_TABS)[number] | (typeof SPECIAL_TABS)[number];

// 近く: every located post, nearest first, measured from the browser's position.
async function nearbyRequest() {
  const [here, { data }] = await Promise.all([currentPosition(), api.get<{ items: Reel[] }>("/reels/map")]);
  const distances: Record<string, number> = {};
  for (const r of data.items) distances[r.id] = distanceKm(here, { lat: r.locationLat!, lng: r.locationLng! });
  const items = [...data.items].sort((a, b) => distances[a.id] - distances[b.id]);
  return { data: { items, personalized: false } };
}

// Home shows its posts as おすすめ 9マス (components/RecommendGrid.tsx).
// Tabs whose grid is split into 定番・注目・穴場 (the others rotate through their own list).
const isTieredTab = (tab: Tab) => tab === "all" || tab === "season" || (REEL_CATEGORIES as readonly string[]).includes(tab);

// The tab's list: the stories row comes from it, and saved/following/nearby
// show it in the grid.
function feedRequest(tab: Tab): Promise<{ data: { items: Reel[]; personalized?: boolean } }> {
  if (tab === "nearby") return nearbyRequest();
  if (tab === "saved") return api.get("/reels/saved");
  if (tab === "following") return api.get("/reels/following");
  return api.get("/reels", { params: tab === "all" ? {} : tab === "season" ? { season: "now" } : { category: tab } });
}

export default function FeedPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");
  const [reels, setReels] = useState<Reel[]>([]);
  // おすすめ 9マス: the three pools (tiered tabs), and the posts opened from the grid.
  const [gridPools, setGridPools] = useState<Pools<Reel> | null>(null);
  const [viewerList, setViewerList] = useState<Reel[] | null>(null);
  // Latest like/save/follow state of posts opened from the grid (its pools aren't refetched).
  const latestRef = useRef(new Map<string, Reel>());
  const [loading, setLoading] = useState(true);
  const [openReelId, setOpenReelId] = useState<string | null>(null);
  // 近く tab: whether location was unavailable.
  const [locationError, setLocationError] = useState(false);
  // Stories being watched: the groups as ordered when opened, so the row
  // re-sorting as posts become "seen" doesn't shift the viewer.
  const [storyView, setStoryView] = useState<{ groups: StoryGroup[]; start: number } | null>(null);
  const seenStories = useSeenStories();
  const [personalized, setPersonalized] = useState(false);
  // Bumped on every tab/login change so responses for a previous list are dropped.
  const listVersion = useRef(0);
  // Pull-to-refresh reloads the list in place (no skeleton) while the dot pulses.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  // 新しい投稿があります: posts published while this feed is open.
  const newPosts = useNewPosts(tab === "all" || tab === "season" || (REEL_CATEGORIES as readonly string[]).includes(tab));
  const unseenNew = newPosts.ids.filter((id) => !reels.some((r) => r.id === id));
  function showNewPosts() {
    newPosts.reset();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  }
  const { pull, progress } = usePullToRefresh(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  });

  useEffect(() => {
    const version = ++listVersion.current;
    if (!refreshingRef.current) setLoading(true);
    setLocationError(false);
    feedRequest(tab)
      .then(({ data }) => {
        if (version !== listVersion.current) return;
        setReels(data.items);
        setPersonalized(!!data.personalized);
      })
      .catch(() => {
        if (version !== listVersion.current || tab !== "nearby") return;
        setReels([]);
        setLocationError(true);
      })
      .finally(() => {
        if (version !== listVersion.current) return;
        setLoading(false);
        refreshingRef.current = false;
        setRefreshing(false);
      });
  }, [token, tab, refreshKey]);

  useEffect(() => {
    if (!isTieredTab(tab)) return;
    let stale = false;
    setGridPools(null);
    latestRef.current.clear();
    api
      .get<Pools<Reel>>("/reels/grid", { params: tab === "all" ? {} : tab === "season" ? { season: "now" } : { category: tab } })
      .then(({ data }) => !stale && setGridPools({ famous: data.famous, middle: data.middle, hidden: data.hidden }))
      .catch(() => !stale && setGridPools({ famous: [], middle: [], hidden: [] }));
    return () => {
      stale = true;
    };
  }, [tab, token, refreshKey]);

  // Saved / following / nearby: the grid rotates through the list itself,
  // starting over only when the list's posts change (not on a like).
  const listKey = reels.map((r) => r.id).join(",");
  const plainPools = useMemo<Pools<Reel>>(
    () => ({ famous: [], middle: [], hidden: reels }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey]
  );

  // A change to one or more posts, wherever they're shown.
  function patchReels(fn: (r: Reel) => Reel) {
    setReels((prev) => prev.map(fn));
    setViewerList((prev) =>
      prev
        ? prev.map((r) => {
            const next = fn(r);
            if (next !== r) latestRef.current.set(next.id, next);
            return next;
          })
        : prev
    );
  }

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
    patchReels((r) => (r.id === reel.id ? { ...r, likedByMe: !r.likedByMe, likeCount: r.likeCount + (r.likedByMe ? -1 : 1) } : r));
  }

  async function toggleSave(reel: Reel) {
    if (!token) return navigate("/login");
    // Which trip(s) it goes in is chosen in the "どの旅に入れる？" sheet.
    const saved = await chooseTrips([reel.id], reel.locationName || reel.municipality.name);
    patchReels((r) => (r.id === reel.id ? { ...r, savedByMe: saved } : r));
    // Unsaving while viewing the "saved" tab should drop it from view immediately.
    if (tab === "saved") setReels((prev) => prev.filter((r) => r.savedByMe));
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
    patchReels((r) => {
      const rTarget = r.postedByCompany ?? r.municipality;
      if (rTarget.id !== target.id) return r;
      return r.postedByCompany
        ? { ...r, postedByCompany: { ...r.postedByCompany, isFollowing: !target.isFollowing } }
        : { ...r, municipality: { ...r.municipality, isFollowing: !target.isFollowing } };
    });
    if (tab === "following" && target.isFollowing) setReels((prev) => prev.filter((r) => (r.postedByCompany ?? r.municipality).id !== target.id));
  }

  // From the grid: the nine on screen, swipeable, with their latest state.
  function openFromGrid(reel: Reel, onScreen: Reel[]) {
    setViewerList(onScreen.map((r) => latestRef.current.get(r.id) ?? r));
    setOpenReelId(reel.id);
  }

  function closeViewer() {
    setViewerList(null);
    setOpenReelId(null);
  }

  function setCommentCount(reelId: string, count: number) {
    patchReels((r) => (r.id === reelId ? { ...r, commentCount: count } : r));
  }

  function emptyMessage() {
    return tab === "saved"
      ? t("feed.emptySaved")
      : tab === "following"
        ? t("feed.emptyFollowing")
        : tab === "nearby" && locationError
          ? t("feed.nearbyNoLocation")
          : tab === "season"
            ? t("season.feedEmpty")
            : t("feed.empty");
  }

  // Stories: the feed's posts grouped by municipality, ones with unwatched
  // posts first (each group keeps feed order).
  const storyGroups: StoryGroup[] = [];
  // Stories are the towns' own posts, not Jaziba's introductions.
  for (const r of reels.filter((r) => !r.editorial)) {
    const group = storyGroups.find((sg) => sg.municipality.id === r.municipality.id);
    if (group) group.reels.push(r);
    else storyGroups.push({ municipality: r.municipality, reels: [r] });
  }
  const isGroupSeen = (sg: StoryGroup) => sg.reels.every((r) => seenStories.has(r.id));
  const stories = [...storyGroups.filter((sg) => !isGroupSeen(sg)), ...storyGroups.filter(isGroupSeen)].slice(0, 20);

  return (
    <div className="mx-auto w-full max-w-[560px] md:px-4">
      {/* Pull-to-refresh indicator: a grey dot grows as you pull and pulses while loading. */}
      <div
        className="flex items-end justify-center overflow-hidden md:hidden"
        style={{ height: refreshing ? 48 : pull, transition: pull ? "none" : "height 0.3s ease" }}
        aria-hidden={!refreshing}
        role="status"
      >
        <span className="relative mb-3 flex h-4 w-4 items-center justify-center">
          {refreshing && <span className="absolute h-4 w-4 animate-ping rounded-full bg-gray-400 opacity-60" />}
          <span
            className="h-3 w-3 rounded-full bg-gray-400"
            style={{ transform: `scale(${refreshing ? 1 : 0.3 + progress * 0.9})`, opacity: refreshing ? 1 : 0.4 + progress * 0.6 }}
          />
        </span>
      </div>
      {unseenNew.length > 0 && (
        <button
          type="button"
          onClick={showNewPosts}
          className="animate-sheet-in fixed left-1/2 top-[calc(var(--header-offset,53px)+3.75rem)] z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-jz-accent px-4 py-2 text-sm font-bold text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)] active:scale-95 md:top-4"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} /> {t("feed.newPosts", { count: unseenNew.length })}
        </button>
      )}
      <WelcomeIntro />

      <h1 className="px-4 pt-5 text-px24 font-extrabold leading-tight tracking-tight text-jz-ink md:px-0 md:pt-8">{t("feed.heroTitle")}</h1>
      <div className="px-3 pt-3 md:px-0">
        <ConciergeButton />
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
              <Avatar name={sg.municipality.name} src={sg.municipality.avatarUrl} size={62} ring seen={isGroupSeen(sg)} />
              <span className={`w-full truncate text-center text-xs ${isGroupSeen(sg) ? "text-gray-500" : "text-gray-900"}`}>
                {sg.municipality.name}
              </span>
            </button>
          ))}
        </nav>
      )}

      <UpcomingEvents />

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
          <Sparkles className="h-4 w-4 shrink-0 text-jz-accent" />
          <span className="min-w-0 flex-1 leading-relaxed">
            {personalized ? t("feed.personalizedNote") : t("feed.personalizeCta")}
          </span>
          <span className="flex shrink-0 items-center font-bold text-jz-accent">
            {personalized ? t("feed.personalizedChange") : t("feed.personalizeSet")}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {(isTieredTab(tab) ? gridPools : !loading) ? (
        (isTieredTab(tab) ? gridPools!.famous.length + gridPools!.middle.length + gridPools!.hidden.length : reels.length) > 0 ? (
          <div className="pb-4">
            <RecommendGrid pools={isTieredTab(tab) ? gridPools! : plainPools} active={!openReelId && !storyView} onOpen={openFromGrid} />
          </div>
        ) : (
          <p className="px-6 py-16 text-center text-sm text-gray-500">{emptyMessage()}</p>
        )
      ) : (
        <div className="grid grid-cols-3 gap-[2px] pt-9" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="skeleton aspect-[3/5]" />
          ))}
        </div>
      )}

      {openReelId && (
        <ReelFullscreenViewer
          reels={viewerList ?? reels}
          initialId={openReelId}
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
    </div>
  );
}
