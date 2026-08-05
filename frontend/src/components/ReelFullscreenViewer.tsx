import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AutoplayVideo from "./AutoplayVideo";
import type { Reel } from "../types";

function ReelOverlayInfo({
  reel,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
}: {
  reel: Reel;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
}) {
  const { t } = useTranslation();
  const poster = reel.postedByCompany ?? reel.municipality;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4 pr-16">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/40">
          {reel.municipality.avatarUrl ? (
            <img src={reel.municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            reel.municipality.name.slice(0, 1)
          )}
        </div>
        <Link to={`/municipalities/${reel.municipality.id}`} className="pointer-events-auto min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white drop-shadow">{reel.municipality.name}</p>
          <p className="truncate text-xs text-white/80 drop-shadow">
            {reel.municipality.prefecture}
            {reel.postedByCompany && t("reelViewer.postedBy", { name: reel.postedByCompany.name })}
          </p>
        </Link>
        <button
          onClick={() => onToggleFollow(reel)}
          className={`pointer-events-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            poster.isFollowing ? "bg-white/20 text-white" : "bg-white text-gray-900"
          }`}
        >
          {poster.isFollowing ? t("reelViewer.following") : t("reelViewer.follow")}
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-10">
        <p className="text-sm text-white drop-shadow">{reel.caption}</p>
        {reel.locationName && (
          <p className="mt-1.5 text-xs text-white/80 drop-shadow">📍 {reel.locationName}</p>
        )}
        {reel.locationLat != null && reel.locationLng != null && (
          <Link
            to={`/reels/${reel.id}/access`}
            state={{ reel }}
            className="pointer-events-auto mt-1.5 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur hover:bg-white/30"
          >
            🧭 {t("reelViewer.accessButton")}
          </Link>
        )}
        <div className="pointer-events-auto mt-2 flex items-center gap-4">
          <button onClick={() => onToggleLike(reel)} className="flex items-center gap-1.5">
            <span className={`text-xl ${reel.likedByMe ? "text-red-500" : "text-white"}`}>
              {reel.likedByMe ? "♥" : "♡"}
            </span>
            <span className="text-sm text-white">{reel.likeCount}</span>
          </button>
          <span className="flex items-center gap-1.5">
            <span className="text-xl text-white">💬</span>
            <span className="text-sm text-white">{reel.commentCount}</span>
          </span>
          <button onClick={() => onToggleSave(reel)} className="ml-auto flex items-center gap-1.5">
            <span className={`text-xl ${reel.savedByMe ? "text-yellow-400" : "text-white"}`}>
              {reel.savedByMe ? "🔖" : "📑"}
            </span>
          </button>
        </div>
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
}: {
  reels: Reel[];
  initialId: string;
  onClose: () => void;
  onToggleLike: (reel: Reel) => void;
  onToggleSave: (reel: Reel) => void;
  onToggleFollow: (reel: Reel) => void;
}) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    itemRefs.current[initialId]?.scrollIntoView({ block: "start" });
    // Only jump to the clicked reel once, when the viewer first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <button
        onClick={onClose}
        className="fixed right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        ✕
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
            />
          </div>
        ))}
      </div>
    </div>
  );
}
