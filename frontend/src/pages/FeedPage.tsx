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

function ReelOverlayInfo({ reel, onToggleLike }: { reel: Reel; onToggleLike: (reel: Reel) => void }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/40">
          {reel.municipality.avatarUrl ? (
            <img src={reel.municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            reel.municipality.name.slice(0, 1)
          )}
        </div>
        <Link to={`/municipalities/${reel.municipality.id}`} className="pointer-events-auto min-w-0">
          <p className="truncate text-sm font-semibold text-white drop-shadow">{reel.municipality.name}</p>
          <p className="truncate text-xs text-white/80 drop-shadow">
            {reel.municipality.prefecture}
            {reel.postedByCompany && ` ・投稿: ${reel.postedByCompany.name}`}
          </p>
        </Link>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-10">
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
        <button onClick={() => onToggleLike(reel)} className="pointer-events-auto mt-2 flex items-center gap-1.5">
          <span className={`text-xl ${reel.likedByMe ? "text-red-500" : "text-white"}`}>
            {reel.likedByMe ? "♥" : "♡"}
          </span>
          <span className="text-sm text-white">{reel.likeCount}</span>
          <span className="ml-3 text-xl text-white">💬</span>
          <span className="text-sm text-white">{reel.commentCount}</span>
        </button>
      </div>
    </>
  );
}

// Fullscreen, Instagram-Reels-style viewer: opens maximized on the clicked reel and
// lets the viewer scroll down through the rest of the feed, one reel per screen.
function ReelFullscreenViewer({
  reels,
  initialId,
  onClose,
  onToggleLike,
}: {
  reels: Reel[];
  initialId: string;
  onClose: () => void;
  onToggleLike: (reel: Reel) => void;
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
            <AutoplayVideo reel={reel} className="h-full w-full object-cover" />
            <ReelOverlayInfo reel={reel} onToggleLike={onToggleLike} />
          </div>
        ))}
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

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6">
      {reels.map((reel) => (
        <ReelThumb key={reel.id} reel={reel} onOpen={(r) => setOpenReelId(r.id)} />
      ))}
      {openReelId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openReelId}
          onClose={() => setOpenReelId(null)}
          onToggleLike={toggleLike}
        />
      )}
    </div>
  );
}
