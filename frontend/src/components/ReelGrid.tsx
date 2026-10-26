import { useTranslation } from "react-i18next";
import { Heart, MessageCircle, Play } from "lucide-react";
import type { Reel } from "../types";

// Profile grid tile, Instagram-style: a square crop of the video with a
// Reels marker; hovering shows like/comment counts. Tapping opens the viewer.
export default function ReelThumb({ reel, onOpen }: { reel: Reel; onOpen: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const label = reel.locationName || reel.caption || reel.municipality.name;
  return (
    <button
      type="button"
      onClick={() => onOpen(reel)}
      className="group relative block aspect-square w-full overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
      aria-label={label}
    >
      {/* #t=0.1 makes browsers paint the first frame as a still. */}
      <video src={`${reel.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      <Play className="absolute right-2 top-2 h-5 w-5 fill-white text-white drop-shadow" aria-hidden />
      <span className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/30 text-sm font-bold text-white group-hover:flex">
        <span className="flex items-center gap-1.5">
          <Heart className="h-5 w-5 fill-white" /> {reel.likeCount}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-5 w-5 -scale-x-100 fill-white" /> {reel.commentCount}
        </span>
      </span>
      <span className="sr-only">{t(`category.${reel.category}`)}</span>
    </button>
  );
}
