import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import type { Reel } from "../types";

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
    <div className="mx-auto grid max-w-6xl grid-cols-3">
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
