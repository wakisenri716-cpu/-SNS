import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import AutoplayVideo from "./AutoplayVideo";
import CommentsSheet from "./CommentsSheet";
import ShareButton from "./ShareButton";
import { TravelerTagChips } from "./TravelerTagChips";
import { Bookmark, Compass, Heart, MapPin, MessageCircle, Sparkles, X } from "lucide-react";
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
  const railButton = "flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition active:scale-90";
  return (
    <>
      {/* Right-hand action rail (TikTok style). */}
      <div className="pointer-events-auto absolute bottom-32 right-3 z-10 flex flex-col items-center gap-4 text-white">
        <button
          type="button"
          onClick={() => onToggleLike(reel)}
          aria-label={t("reelViewer.likeLabel")}
          aria-pressed={reel.likedByMe}
          className="flex flex-col items-center gap-1"
        >
          <span className={railButton}>
            <Heart className={`h-6 w-6 ${reel.likedByMe ? "fill-brand-500 text-brand-500" : ""}`} />
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
            <MessageCircle className="h-6 w-6" />
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
            <Bookmark className={`h-6 w-6 ${reel.savedByMe ? "fill-amber-400 text-amber-400" : ""}`} />
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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-orange-300 text-sm font-bold text-white ring-2 ring-white">
              {reel.municipality.avatarUrl ? (
                <img src={reel.municipality.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                reel.municipality.name.slice(0, 1)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold text-white drop-shadow">{poster.name}</span>
              <span className="block truncate text-xs text-white/75 drop-shadow">
                {reel.postedByCompany ? reel.municipality.name : reel.municipality.prefecture}
              </span>
            </span>
          </Link>
          <button
            onClick={() => onToggleFollow(reel)}
            aria-pressed={poster.isFollowing}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              poster.isFollowing ? "bg-white/20 text-white ring-1 ring-white/50" : "bg-white text-gray-900"
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
          <p className="mt-2 flex items-start gap-1 text-xs font-semibold text-amber-200 drop-shadow">
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
            className="pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-lg transition active:scale-95"
          >
            <Compass className="h-4 w-4 text-brand-600" /> {t("reelViewer.accessButton")}
          </Link>
        )}
      </div>
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
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onCommentCountChange,
}: {
  reels: Reel[];
  initialId: string;
  onClose: () => void;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
  onCommentCountChange: (reelId: string, count: number) => void;
}) {
  const { t } = useTranslation();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);

  useEffect(() => {
    itemRefs.current[initialId]?.scrollIntoView({ block: "start" });
    // Only jump to the clicked reel once, when the viewer first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <button
        onClick={onClose}
        aria-label={t("reelViewer.closeLabel")}
        className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md hover:bg-black/50"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="h-full snap-y snap-mandatory overflow-y-scroll">
        {reels.map((reel) => (
          <div
            key={reel.id}
            ref={(el) => {
              itemRefs.current[reel.id] = el;
            }}
            className="relative h-full w-full snap-start"
          >
            <AutoplayVideo src={reel.videoUrl} className="h-full w-full object-cover" />
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
