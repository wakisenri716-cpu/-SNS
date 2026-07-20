import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Reel } from "../types";

function ReelCard({ reel, onToggleLike }: { reel: Reel; onToggleLike: (reel: Reel) => void }) {
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

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
          {reel.municipality.avatarUrl ? (
            <img src={reel.municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            reel.municipality.name.slice(0, 1)
          )}
        </div>
        <Link to={`/municipalities/${reel.municipality.id}`} className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{reel.municipality.name}</p>
          <p className="truncate text-xs text-gray-500">{reel.municipality.prefecture}</p>
        </Link>
      </div>

      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="aspect-video w-full bg-black object-cover"
        loop
        muted
        playsInline
        controls
      />

      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => onToggleLike(reel)} className="flex items-center gap-1.5">
          <span className={`text-xl ${reel.likedByMe ? "text-red-500" : "text-gray-700"}`}>
            {reel.likedByMe ? "♥" : "♡"}
          </span>
          <span className="text-sm text-gray-700">{reel.likeCount}</span>
        </button>
        <span className="flex items-center gap-1.5 text-sm text-gray-700">
          <span className="text-xl">💬</span>
          {reel.commentCount}
        </span>
      </div>

      <div className="px-4 pb-4 pt-2">
        <p className="text-sm text-gray-800">{reel.caption}</p>
        {reel.locationName && (
          <p className="mt-1.5 text-xs text-gray-500">
            📍 {reel.locationName}
            {reel.transitSuggestion && (
              <>
                {" "}
                ・最寄り駅から徒歩+電車で約{reel.transitSuggestion.totalDurationMin}分
                <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-400">交通情報は仮データ</span>
              </>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

export default function FeedPage() {
  const { token } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      {reels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          まだ投稿がありません。自治体アカウントで最初のリールを投稿してみましょう。
        </p>
      ) : (
        reels.map((reel) => <ReelCard key={reel.id} reel={reel} onToggleLike={toggleLike} />)
      )}
    </div>
  );
}
