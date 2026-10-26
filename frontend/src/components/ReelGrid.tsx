import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import AutoplayVideo from "./AutoplayVideo";
import { CATEGORY_ICON } from "../lib/categoryIcons";
import type { Reel } from "../types";

// Feed/profile card: the (landscape) video on top, uncropped, with the place
// and poster underneath — tapping anywhere opens the fullscreen viewer.
export default function ReelThumb({ reel, onOpen }: { reel: Reel; onOpen: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const poster = reel.postedByCompany?.name ?? reel.municipality.name;
  return (
    <button
      type="button"
      onClick={() => onOpen(reel)}
      className="group block w-full text-left focus:outline-none"
      aria-label={reel.locationName || reel.caption || poster}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-sm ring-1 ring-black/5 transition group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
        <AutoplayVideo
          src={reel.videoUrl}
          className="aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-gray-800 backdrop-blur">
          {CATEGORY_ICON[reel.category]} {t(`category.${reel.category}`)}
        </span>
        {reel.savedByMe && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white backdrop-blur">
            🔖
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-start gap-2.5 px-0.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-orange-300 text-xs font-bold text-white">
          {reel.municipality.avatarUrl ? (
            <img src={reel.municipality.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            reel.municipality.name.slice(0, 1)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-gray-900">{reel.locationName || reel.caption || poster}</p>
          <p className="truncate text-xs text-gray-500">
            {poster} · {reel.municipality.prefecture}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs text-gray-500">
          <Heart className={`h-3.5 w-3.5 ${reel.likedByMe ? "fill-brand-600 text-brand-600" : ""}`} />
          {reel.likeCount}
        </span>
      </div>
    </button>
  );
}
