import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Reel } from "../types";

function AutoplayVideo({ reel, className }: { reel: Reel; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <video ref={videoRef} src={reel.videoUrl} className={className} loop muted playsInline />;
}

// Grid thumbnail: video only, no icon/caption until the viewer opens it.
function ReelThumb({ reel, onOpen }: { reel: Reel; onOpen: (reel: Reel) => void }) {
  return (
    <button
      onClick={() => onOpen(reel)}
      className="relative block w-full overflow-hidden rounded-xl bg-black text-left"
    >
      <AutoplayVideo reel={reel} className="aspect-video w-full object-cover" />
    </button>
  );
}

// Opened (large) view: icon/name/caption/like appear here, and the icon+name link
// through to the municipality's profile page.
function ReelDetail({
  reel,
  onClose,
  onToggleLike,
}: {
  reel: Reel;
  onClose: () => void;
  onToggleLike: (reel: Reel) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-xl bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          ✕
        </button>

        <AutoplayVideo reel={reel} className="aspect-video w-full object-cover" />

        <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/40">
            {reel.municipality.avatarUrl ? (
              <img src={reel.municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
            ) : (
              reel.municipality.name.slice(0, 1)
            )}
          </div>
          <Link to={`/municipalities/${reel.municipality.id}`} className="min-w-0">
            <p className="truncate text-sm font-semibold text-white drop-shadow">{reel.municipality.name}</p>
            <p className="truncate text-xs text-white/80 drop-shadow">
              {reel.municipality.prefecture}
              {reel.postedByCompany && ` ・投稿: ${reel.postedByCompany.name}`}
            </p>
          </Link>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-10">
          <p className="text-sm text-white drop-shadow">{reel.caption}</p>
          {reel.locationName && (
            <p className="mt-1.5 text-xs text-white/80 drop-shadow">
              📍 {reel.locationName}
              {reel.transitSuggestion && (
                <>
                  {" "}
                  ・最寄り駅から徒歩+電車で約{reel.transitSuggestion.totalDurationMin}分
                  <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5">交通情報は仮データ</span>
                </>
              )}
            </p>
          )}
          <button onClick={() => onToggleLike(reel)} className="mt-2 flex items-center gap-1.5">
            <span className={`text-xl ${reel.likedByMe ? "text-red-500" : "text-white"}`}>
              {reel.likedByMe ? "♥" : "♡"}
            </span>
            <span className="text-sm text-white">{reel.likeCount}</span>
            <span className="ml-3 text-xl text-white">💬</span>
            <span className="text-sm text-white">{reel.commentCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { token } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/reels").then(({ data }) => setReels(data.items));
    setLoading(false);
  }, [token]);

  async function toggleLike(reel: Reel) {
    if (!token) return;
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

  if (loading) return <p className="p-10 text-center text-gray-400">読み込み中...</p>;

  if (reels.length === 0) {
    return (
      <p className="m-6 rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
        まだ投稿がありません。自治体アカウントで最初のリールを投稿してみましょう。
      </p>
    );
  }

  const openReel = reels.find((r) => r.id === openReelId) ?? null;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6">
      {reels.map((reel) => (
        <ReelThumb key={reel.id} reel={reel} onOpen={(r) => setOpenReelId(r.id)} />
      ))}
      {openReel && (
        <ReelDetail reel={openReel} onClose={() => setOpenReelId(null)} onToggleLike={toggleLike} />
      )}
    </div>
  );
}
