import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Heart, MapPin, MessageCircle, Navigation, Volume2, VolumeX } from "lucide-react";
import AutoplayVideo from "./AutoplayVideo";
import Avatar from "./Avatar";
import HeartBurst from "./HeartBurst";
import ShareButton from "./ShareButton";
import { toggleSound, useSoundOn } from "../lib/videoPlayback";
import { useTapGestures } from "../lib/useTapGestures";
import { useAmbientColor } from "../lib/useAmbientColor";
import { relativeTime } from "../lib/relativeTime";
import type { Reel } from "../types";

function haptic() {
  navigator.vibrate?.(8);
}

// One post in the home feed as a Jaziba travel card: the video carries the
// poster (top) and the place with a "行き方" button (bottom) — getting there
// is what Jaziba is for — and glows in the footage's own colors. Below: like,
// comment, share and the しおり (save) pill, then caption, tags and comments.
// On the video, tap opens the fullscreen viewer and double tap likes.
export default function FeedPost({
  reel,
  heroName,
  onOpen,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenComments,
}: {
  reel: Reel;
  /** View-transition name for the media while it morphs into/out of the viewer. */
  heroName?: string;
  onOpen: (reel: Reel) => void;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
  onOpenComments: (reel: Reel) => void;
}) {
  const { t, i18n } = useTranslation();
  const poster = reel.postedByCompany ?? reel.municipality;
  const tags = [t(`category.${reel.category}`), ...reel.travelerTags.map((tag) => t(`travelerTag.${tag}`))];
  const hasLocation = reel.locationLat != null && reel.locationLng != null;
  const soundOn = useSoundOn();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ambient = useAmbientColor(videoRef);
  const [burst, setBurst] = useState(0);
  // The media keeps its own shape, clamped between 4:5 (tall) and 1.91:1
  // (wide); 4:5 until the video reports its size.
  const [ratio, setRatio] = useState(4 / 5);
  const onTap = useTapGestures(
    () => onOpen(reel),
    () => {
      setBurst((n) => n + 1);
      haptic();
      if (!reel.likedByMe) onToggleLike(reel);
    }
  );

  return (
    <article data-reel-id={reel.id} className="reveal px-3 pb-7 md:px-0">
      <div
        className="relative overflow-hidden rounded-[26px] bg-gray-100 transition-shadow duration-700"
        style={{
          aspectRatio: Math.min(1.91, Math.max(0.8, ratio)),
          boxShadow: ambient ? `0 22px 50px -22px ${ambient}, 0 8px 24px -14px ${ambient}` : undefined,
          viewTransitionName: heroName,
        }}
      >
        <button type="button" onClick={onTap} className="block h-full w-full" aria-label={t("feed.openFullscreen")}>
          <AutoplayVideo src={reel.videoUrl} className="h-full w-full object-cover" onAspectRatio={setRatio} videoRef={videoRef} />
        </button>
        {burst > 0 && <HeartBurst key={burst} />}

        {/* Poster, top-left */}
        <div className="glass-dark absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full py-1 pl-1 pr-1.5 text-white">
          <Link to={`/municipalities/${reel.municipality.id}`} className="flex min-w-0 items-center gap-2">
            <Avatar name={reel.municipality.name} src={reel.municipality.avatarUrl} size={28} />
            <span className="truncate text-[13px] font-semibold">{poster.name}</span>
          </Link>
          {poster.isFollowing ? (
            <span className="pr-1.5 text-[11px] text-white/70">{t("reelViewer.following")}</span>
          ) : (
            <button
              type="button"
              onClick={() => onToggleFollow(reel)}
              className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-jz-ink transition active:scale-95"
            >
              {t("reelViewer.follow")}
            </button>
          )}
        </div>

        {/* Place + directions, bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/65 via-black/25 to-transparent p-3 pt-16">
          <div className="min-w-0 flex-1 text-white">
            {reel.locationName && (
              <p className="flex items-center gap-1 truncate text-[15px] font-bold drop-shadow">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{reel.locationName}</span>
              </p>
            )}
            <p className="truncate pl-5 text-xs text-white/75">{reel.municipality.prefecture}</p>
          </div>
          {hasLocation && (
            <Link
              to={`/reels/${reel.id}/access`}
              state={{ reel }}
              className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full bg-jz-red px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_6px_20px_-6px_rgba(215,32,46,0.8)] transition hover:bg-jz-red-dark active:scale-95"
            >
              <Navigation className="h-3.5 w-3.5 fill-white" /> {t("feed.directions")}
            </Link>
          )}
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? t("feed.soundOff") : t("feed.soundOn")}
            aria-pressed={soundOn}
            className="glass-dark pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 pt-2.5">
        <button
          type="button"
          onClick={() => {
            haptic();
            onToggleLike(reel);
          }}
          aria-label={t("reelViewer.likeLabel")}
          aria-pressed={reel.likedByMe}
          className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-jz-ink transition hover:bg-gray-100 active:scale-90"
        >
          <Heart
            key={String(reel.likedByMe)}
            className={`h-6 w-6 ${reel.likedByMe ? "animate-like-pop fill-jz-red text-jz-red" : ""}`}
            strokeWidth={1.8}
          />
          {reel.likeCount > 0 && <span className="tabular-nums">{reel.likeCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => onOpenComments(reel)}
          aria-label={t("comments.heading")}
          className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-jz-ink transition hover:bg-gray-100 active:scale-90"
        >
          <MessageCircle className="h-6 w-6 -scale-x-100" strokeWidth={1.8} />
          {reel.commentCount > 0 && <span className="tabular-nums">{reel.commentCount}</span>}
        </button>
        <span className="px-1">
          <ShareButton
            path={`/reels/${reel.id}/access`}
            title={`${reel.locationName || reel.municipality.name} | ${t("brand.name")}`}
            variant="icon"
          />
        </span>
        <button
          type="button"
          onClick={() => {
            haptic();
            onToggleSave(reel);
          }}
          aria-label={t("reelViewer.saveLabel")}
          aria-pressed={reel.savedByMe}
          className={`ml-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95 ${
            reel.savedByMe ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink hover:bg-gray-200"
          }`}
        >
          <Bookmark
            key={String(reel.savedByMe)}
            className={`h-4 w-4 ${reel.savedByMe ? "animate-like-pop fill-white" : ""}`}
            strokeWidth={2}
          />
          {reel.savedByMe ? t("feed.savedPill") : t("feed.savePill")}
        </button>
      </div>

      <div className="space-y-1.5 px-1 pt-1.5 text-sm text-jz-ink">
        {reel.caption && <p className="leading-relaxed">{reel.caption}</p>}
        <p className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              <span className="text-jz-red">#</span>
              {tag.replace(/\s+/g, "")}
            </span>
          ))}
        </p>
        <p className="flex items-center gap-2 text-xs text-gray-400">
          <button type="button" onClick={() => onOpenComments(reel)} className="hover:text-gray-600">
            {reel.commentCount > 0 ? t("feed.viewComments", { count: reel.commentCount }) : t("feed.addComment")}
          </button>
          <span aria-hidden>·</span>
          <time dateTime={reel.createdAt}>{relativeTime(reel.createdAt, i18n.language)}</time>
        </p>
      </div>
    </article>
  );
}
