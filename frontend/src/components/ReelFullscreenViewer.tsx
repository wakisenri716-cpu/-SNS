import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import AutoplayVideo from "./AutoplayVideo";
import Avatar from "./Avatar";
import HeartBurst from "./HeartBurst";
import CommentsSheet from "./CommentsSheet";
import ShareButton from "./ShareButton";
import { TravelerTagChips } from "./TravelerTagChips";
import { Bookmark, Heart, MapPin, MessageCircle, Navigation, Play, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { toggleSound, useSoundOn } from "../lib/videoPlayback";
import { useTapGestures } from "../lib/useTapGestures";
import type { Reel } from "../types";

function ReelOverlayInfo({
  reel,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenComments,
}: {
  reel: Reel;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
  onOpenComments: (reel: Reel) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const poster = reel.postedByCompany ?? reel.municipality;
  const reasonLabels = (reel.recommendReasons ?? []).map((reason) =>
    reason === "favoriteCategory"
      ? t("feed.reasonFavoriteCategory", { category: t(`category.${reel.category}`) })
      : reason === "companion"
        ? t("feed.reasonCompanion", { who: t(`settings.companion.${user?.travelCompanion ?? "solo"}`) })
        : t(`travelerTag.${reason}`)
  );
  const railButton = "flex h-9 w-9 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition active:scale-90";
  return (
    <>
      {/* Right-hand action rail (Reels style: bare icons over the video). */}
      <div className="pointer-events-auto absolute bottom-28 right-2 z-10 flex flex-col items-center gap-5 text-white">
        <button
          type="button"
          onClick={() => onToggleLike(reel)}
          aria-label={t("reelViewer.likeLabel")}
          aria-pressed={reel.likedByMe}
          className="flex flex-col items-center gap-1"
        >
          <span className={railButton}>
            <Heart key={String(reel.likedByMe)} className={`h-7 w-7 ${reel.likedByMe ? "animate-like-pop fill-jz-red text-jz-red" : ""}`} strokeWidth={1.8} />
          </span>
          <span className="text-xs font-semibold drop-shadow">{reel.likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenComments(reel)}
          aria-label={t("comments.heading")}
          className="flex flex-col items-center gap-1"
        >
          <span className={railButton}>
            <MessageCircle className="h-7 w-7 -scale-x-100" strokeWidth={1.8} />
          </span>
          <span className="text-xs font-semibold drop-shadow">{reel.commentCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleSave(reel)}
          aria-label={t("reelViewer.saveLabel")}
          aria-pressed={reel.savedByMe}
          className="flex flex-col items-center gap-1"
        >
          <span className={railButton}>
            <Bookmark key={String(reel.savedByMe)} className={`h-7 w-7 ${reel.savedByMe ? "animate-like-pop fill-white" : ""}`} strokeWidth={1.8} />
          </span>
          <span className="text-xs font-semibold drop-shadow">{t("reelViewer.saveShort")}</span>
        </button>
        <ShareButton
          path={`/reels/${reel.id}/access`}
          title={`${reel.locationName || reel.municipality.name} | ${t("brand.name")}`}
          variant="rail"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pr-20 pt-24">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <Link
            to={`/municipalities/${reel.municipality.id}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            <Avatar name={reel.municipality.name} src={reel.municipality.avatarUrl} size={34} ring />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white drop-shadow">{poster.name}</span>
              <span className="block truncate text-xs text-white/75 drop-shadow">
                {reel.postedByCompany ? reel.municipality.name : reel.municipality.prefecture}
              </span>
            </span>
          </Link>
          <button
            onClick={() => onToggleFollow(reel)}
            aria-pressed={poster.isFollowing}
            className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/70 transition ${
              poster.isFollowing ? "bg-white/10" : ""
            }`}
          >
            {poster.isFollowing ? t("reelViewer.following") : t("reelViewer.follow")}
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white drop-shadow">{reel.caption}</p>
        {reel.locationName && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-white/90 drop-shadow">
            <MapPin className="h-3.5 w-3.5" /> {reel.locationName}
          </p>
        )}
        {reasonLabels.length > 0 && (
          <p className="mt-2 flex items-start gap-1 text-xs font-semibold text-white/90 drop-shadow">
            <Sparkles className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              {t("feed.reasonPrefix")}
              {reasonLabels.join("・")}
            </span>
          </p>
        )}
        {reel.travelerTags.length > 0 && (
          <div className="mt-2">
            <TravelerTagChips tags={reel.travelerTags} dark />
          </div>
        )}
        {reel.locationLat != null && reel.locationLng != null && (
          <Link
            to={`/reels/${reel.id}/access`}
            state={{ reel }}
            className="pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-jz-red px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(215,32,46,0.8)] transition hover:bg-jz-red-dark active:scale-95"
          >
            <Navigation className="h-4 w-4 fill-white" /> {t("reelViewer.accessButton")}
          </Link>
        )}
      </div>
    </>
  );
}

function SoundButton() {
  const { t } = useTranslation();
  const soundOn = useSoundOn();
  return (
    <button
      onClick={toggleSound}
      aria-label={soundOn ? t("feed.soundOff") : t("feed.soundOn")}
      aria-pressed={soundOn}
      className="fixed right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
    >
      {soundOn ? <Volume2 className="h-6 w-6" strokeWidth={1.8} /> : <VolumeX className="h-6 w-6" strokeWidth={1.8} />}
    </button>
  );
}

// One reel's video: tap pauses/resumes, double tap likes with the big heart,
// and a thin bar along the bottom shows playback progress.
function ViewerVideo({ reel, onLike }: { reel: Reel; onLike: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && barRef.current && v.duration) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onTap = useTapGestures(
    () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        v.play().catch(() => {});
        setPaused(false);
      } else {
        v.pause();
        setPaused(true);
      }
    },
    () => {
      setBurst((n) => n + 1);
      onLike();
    }
  );

  return (
    <>
      <button type="button" onClick={onTap} className="block h-full w-full" aria-label={t("reelViewer.playPause")}>
        <AutoplayVideo src={reel.videoUrl} className="h-full w-full object-cover" videoRef={videoRef} />
      </button>
      {burst > 0 && <HeartBurst key={burst} />}
      {paused && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="glass-dark animate-fade-in flex h-20 w-20 items-center justify-center rounded-full">
            <Play className="ml-1 h-9 w-9 fill-white text-white" />
          </span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 z-20 h-[3px] bg-white/20" aria-hidden>
        <span ref={barRef} className="block h-full origin-left scale-x-0 bg-white" />
      </span>
    </>
  );
}

// Fullscreen, Instagram-Reels-style viewer: opens maximized on the clicked reel and
// lets the viewer scroll down through the rest of the given reel list, one reel per
// screen. Shared by the main feed and the municipality profile's post grid so both
// open the exact same experience.
export default function ReelFullscreenViewer({
  reels,
  initialId,
  onClose,
  heroId,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onCommentCountChange,
}: {
  reels: Reel[];
  initialId: string;
  /** Called with the reel showing when the viewer is closed. */
  onClose: (currentId: string) => void;
  /** While set, that reel's slide carries the shared view-transition name. */
  heroId?: string | null;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
  onCommentCountChange: (reelId: string, count: number) => void;
}) {
  const { t } = useTranslation();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // Opened with a morph from the feed card: skip the zoom-in animation.
  const [morphedIn] = useState(() => !!heroId);

  function close() {
    const sc = scrollerRef.current;
    const idx = sc ? Math.round(sc.scrollTop / Math.max(1, sc.clientHeight)) : 0;
    onClose(reels[Math.min(idx, reels.length - 1)]?.id ?? initialId);
  }

  // offsetTop rather than scrollIntoView: it isn't thrown off by the opening
  // zoom animation, and runs before paint so there's no visible jump.
  useLayoutEffect(() => {
    const item = itemRefs.current[initialId];
    if (item && scrollerRef.current) scrollerRef.current.scrollTop = item.offsetTop;
    // Only jump to the clicked reel once, when the viewer first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`on-media fixed inset-0 z-50 bg-black ${morphedIn ? "" : "animate-viewer-in"}`}>
      <SoundButton />
      <button
        onClick={close}
        aria-label={t("reelViewer.closeLabel")}
        className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
      >
        <X className="h-7 w-7" strokeWidth={1.8} />
      </button>

      <div ref={scrollerRef} className="h-full snap-y snap-mandatory overflow-y-scroll">
        {reels.map((reel) => (
          <div
            key={reel.id}
            ref={(el) => {
              itemRefs.current[reel.id] = el;
            }}
            className="relative h-full w-full snap-start"
            style={{ viewTransitionName: reel.id === heroId ? "reel-hero" : undefined }}
          >
            <ViewerVideo reel={reel} onLike={() => !reel.likedByMe && onToggleLike(reel)} />
            <ReelOverlayInfo
              reel={reel}
              onToggleLike={onToggleLike}
              onToggleSave={onToggleSave}
              onToggleFollow={onToggleFollow}
              onOpenComments={(r) => setCommentsReelId(r.id)}
            />
          </div>
        ))}
      </div>

      {commentsReelId && (
        <CommentsSheet
          reelId={commentsReelId}
          onClose={() => setCommentsReelId(null)}
          onCountChange={(count) => onCommentCountChange(commentsReelId, count)}
        />
      )}
    </div>
  );
}
