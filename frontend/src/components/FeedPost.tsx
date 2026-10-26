import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Heart, MessageCircle, Volume2, VolumeX } from "lucide-react";
import AutoplayVideo from "./AutoplayVideo";
import Avatar from "./Avatar";
import HeartBurst from "./HeartBurst";
import ShareButton from "./ShareButton";
import { toggleSound, useSoundOn } from "../lib/videoPlayback";
import { useTapGestures } from "../lib/useTapGestures";
import type { Reel } from "../types";

// One post in the home feed, Instagram-style: header, media, action row,
// likes, caption with hashtags, comments link, date. On the video: tap opens
// the fullscreen viewer, double tap likes (with the big heart), and the corner
// button switches sound on/off for every video.
export default function FeedPost({
  reel,
  onOpen,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenComments,
}: {
  reel: Reel;
  onOpen: (reel: Reel) => void;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
  onOpenComments: (reel: Reel) => void;
}) {
  const { t, i18n } = useTranslation();
  const poster = reel.postedByCompany ?? reel.municipality;
  const hashtags = [t(`category.${reel.category}`), ...reel.travelerTags.map((tag) => t(`travelerTag.${tag}`))];
  const hasLocation = reel.locationLat != null && reel.locationLng != null;
  const soundOn = useSoundOn();
  const [burst, setBurst] = useState(0);
  // Like Instagram, the media keeps its own shape, clamped between 4:5 (tall)
  // and 1.91:1 (wide); 4:5 until the video reports its size.
  const [ratio, setRatio] = useState(4 / 5);
  const onTap = useTapGestures(
    () => onOpen(reel),
    () => {
      setBurst((n) => n + 1);
      if (!reel.likedByMe) onToggleLike(reel);
    }
  );

  return (
    <article className="border-b border-gray-100 pb-5 md:mb-4 md:border-0">
      <header className="flex items-center gap-3 px-3 py-3 md:px-0">
        <Link to={`/municipalities/${reel.municipality.id}`} aria-label={reel.municipality.name}>
          <Avatar name={reel.municipality.name} src={reel.municipality.avatarUrl} size={34} ring />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1.5 text-sm">
            <Link to={`/municipalities/${reel.municipality.id}`} className="truncate font-semibold text-gray-900">
              {poster.name}
            </Link>
            {!poster.isFollowing && (
              <>
                <span className="text-gray-400">•</span>
                <button
                  type="button"
                  onClick={() => onToggleFollow(reel)}
                  className="shrink-0 font-semibold text-[#0095f6] hover:text-[#00376b]"
                >
                  {t("reelViewer.follow")}
                </button>
              </>
            )}
          </p>
          {reel.locationName &&
            (hasLocation ? (
              <Link to={`/reels/${reel.id}/access`} state={{ reel }} className="block truncate text-xs text-gray-700">
                {reel.locationName}
              </Link>
            ) : (
              <p className="truncate text-xs text-gray-700">{reel.locationName}</p>
            ))}
        </div>
      </header>

      <div className="relative overflow-hidden bg-gray-100 md:rounded-2xl" style={{ aspectRatio: Math.min(1.91, Math.max(0.8, ratio)) }}>
        <button type="button" onClick={onTap} className="block h-full w-full" aria-label={t("feed.openFullscreen")}>
          <AutoplayVideo src={reel.videoUrl} className="h-full w-full object-cover" onAspectRatio={setRatio} />
        </button>
        {burst > 0 && <HeartBurst key={burst} />}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundOn ? t("feed.soundOff") : t("feed.soundOn")}
          aria-pressed={soundOn}
          className="glass-dark absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-white transition active:scale-90"
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex items-center gap-4 px-3 pt-3 md:px-0">
        <button
          type="button"
          onClick={() => onToggleLike(reel)}
          aria-label={t("reelViewer.likeLabel")}
          aria-pressed={reel.likedByMe}
          className="transition active:scale-90"
        >
          <Heart
            key={String(reel.likedByMe)}
            className={`h-[26px] w-[26px] ${reel.likedByMe ? "animate-like-pop fill-[#ff3040] text-[#ff3040]" : "text-gray-900 hover:text-gray-500"}`}
            strokeWidth={1.8}
          />
        </button>
        <button type="button" onClick={() => onOpenComments(reel)} aria-label={t("comments.heading")}>
          <MessageCircle className="h-[26px] w-[26px] -scale-x-100 text-gray-900 hover:text-gray-500" strokeWidth={1.8} />
        </button>
        <ShareButton
          path={`/reels/${reel.id}/access`}
          title={`${reel.locationName || reel.municipality.name} | ${t("brand.name")}`}
          variant="icon"
        />
        <button
          type="button"
          onClick={() => onToggleSave(reel)}
          aria-label={t("reelViewer.saveLabel")}
          aria-pressed={reel.savedByMe}
          className="ml-auto transition active:scale-90"
        >
          <Bookmark
            key={String(reel.savedByMe)}
            className={`h-[26px] w-[26px] ${reel.savedByMe ? "animate-like-pop fill-gray-900 text-gray-900" : "text-gray-900 hover:text-gray-500"}`}
            strokeWidth={1.8}
          />
        </button>
      </div>

      <div className="space-y-1 px-3 pt-2.5 text-sm text-gray-900 md:px-0">
        {reel.likeCount > 0 && <p className="font-semibold">{t("feed.likes", { count: reel.likeCount })}</p>}
        {reel.caption && (
          <p className="leading-snug">
            <span className="mr-1.5 font-semibold">{poster.name}</span>
            {reel.caption}
          </p>
        )}
        <p className="leading-snug text-[#00376b]">{hashtags.map((h) => `#${h.replace(/\s+/g, "")}`).join(" ")}</p>
        {hasLocation && (
          <Link to={`/reels/${reel.id}/access`} state={{ reel }} className="inline-block font-semibold text-gray-900 hover:underline">
            {t("feed.seeAccess")}
          </Link>
        )}
        <button type="button" onClick={() => onOpenComments(reel)} className="block text-gray-500">
          {reel.commentCount > 0 ? t("feed.viewComments", { count: reel.commentCount }) : t("feed.addComment")}
        </button>
        <p className="text-[11px] uppercase tracking-wide text-gray-400">
          {new Date(reel.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </article>
  );
}
