import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import AutoplayVideo from "./AutoplayVideo";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import type { Reel, TransitSuggestion } from "../types";

// "アクセス" button on a reel: the viewer types in their own starting point
// and gets an estimated time/mode/fare from there to THIS reel's specific
// location — a one-shot, user-initiated lookup (GET /reels/:id/access-plan),
// distinct from the municipality-wide access planner on the profile page.
function ReelAccessPlanner({ reelId }: { reelId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransitSuggestion | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!origin.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.get(`/reels/${reelId}/access-plan`, { params: { origin: origin.trim() } });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("accessPlanner.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-auto mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur hover:bg-white/30"
      >
        🧭 {t("reelViewer.accessButton")}
      </button>
      {open && (
        <div className="mt-2 max-w-xs rounded-lg bg-black/70 p-3 backdrop-blur">
          <form onSubmit={search} className="flex gap-2">
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder={t("accessPlanner.originPlaceholder")}
              className="w-full rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/50 outline-none focus:border-white"
            />
            <button
              type="submit"
              disabled={loading || !origin.trim()}
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? t("accessPlanner.searching") : t("accessPlanner.search")}
            </button>
          </form>
          {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
          {result && (
            <div className="mt-2 text-xs text-white/90">
              <p>
                🕐 {t("accessPlanner.duration", { minutes: result.totalDurationMin })}
                {" · "}
                {result.legs
                  .map((leg) => t(TRANSIT_MODE_LABEL_KEY[leg.mode] ?? "accessPlanner.modeDrive"))
                  .join(t("accessPlanner.modeSeparator"))}
                {" · "}💴{" "}
                {result.estimatedFareYen > 0
                  ? t("accessPlanner.fare", { yen: result.estimatedFareYen.toLocaleString() })
                  : t("accessPlanner.fareFree")}
                {result.isMock && (
                  <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5">{t("reelViewer.mockBadge")}</span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-white/60">{t("accessPlanner.fareDisclaimer")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
        {reel.locationLat != null && reel.locationLng != null && <ReelAccessPlanner reelId={reel.id} />}
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
