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
    <section className="relative flex h-[calc(100vh-116px)] w-full snap-start items-center justify-center bg-neutral-900">
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="h-full w-full object-cover"
        loop
        muted
        playsInline
        controls={false}
      />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="min-w-0 flex-1 text-sm">
          <Link to={`/municipalities/${reel.municipality.id}`} className="font-semibold">
            {reel.municipality.name}（{reel.municipality.prefecture}）
          </Link>
          <p className="mt-1 line-clamp-2 text-white/90">{reel.caption}</p>
          {reel.locationName && (
            <p className="mt-1 text-xs text-white/70">
              📍 {reel.locationName}
              {reel.transitSuggestion && (
                <>
                  {" "}
                  ・最寄り駅から徒歩+電車で約{reel.transitSuggestion.totalDurationMin}分
                  <span className="ml-1 rounded bg-white/10 px-1">交通情報は仮データ</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-3">
          <button onClick={() => onToggleLike(reel)} className="flex flex-col items-center text-xs">
            <span className={`text-2xl ${reel.likedByMe ? "text-pink-500" : "text-white"}`}>♥</span>
            {reel.likeCount}
          </button>
          <Link to={`/municipalities/${reel.municipality.id}`} className="flex flex-col items-center text-xs">
            <span className="text-2xl">🏛️</span>
            詳細
          </Link>
        </div>
      </div>
    </section>
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

  if (loading) return <p className="p-6 text-center text-white/60">読み込み中...</p>;
  if (reels.length === 0) {
    return (
      <p className="p-6 text-center text-white/60">
        まだ投稿がありません。自治体アカウントで最初のリールを投稿してみましょう。
      </p>
    );
  }

  return (
    <div className="h-full snap-y snap-mandatory overflow-y-scroll">
      {reels.map((reel) => (
        <ReelCard key={reel.id} reel={reel} onToggleLike={toggleLike} />
      ))}
    </div>
  );
}
