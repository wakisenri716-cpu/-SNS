import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Municipality, Reel } from "../types";

interface RecommendItem {
  id: string;
  videoUrl: string;
  caption: string;
  municipality: { id: string; name: string; prefecture: string };
  likeCount: number;
  commentCount: number;
  score: number;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [recommend, setRecommend] = useState<RecommendItem[]>([]);

  useEffect(() => {
    api.get("/search/recommend").then(({ data }) => setRecommend(data.items));
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setMunicipalities([]);
      setReels([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get("/search", { params: { q } }).then(({ data }) => {
        setMunicipalities(data.municipalities);
        setReels(data.reels);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="p-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="地域名・キーワードで検索"
        className="w-full rounded border border-white/20 bg-transparent p-2 text-sm"
      />

      {q.trim() ? (
        <div className="mt-4 flex flex-col gap-4">
          {municipalities.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-white/60">自治体</h3>
              <div className="flex flex-col gap-2">
                {municipalities.map((m) => (
                  <Link key={m.id} to={`/municipalities/${m.id}`} className="rounded border border-white/10 p-2 text-sm">
                    {m.name}（{m.prefecture}）
                  </Link>
                ))}
              </div>
            </div>
          )}
          {reels.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-white/60">投稿</h3>
              <div className="grid grid-cols-3 gap-1">
                {reels.map((r) => (
                  <video key={r.id} src={r.videoUrl} className="aspect-[9/16] w-full bg-neutral-800 object-cover" muted />
                ))}
              </div>
            </div>
          )}
          {municipalities.length === 0 && reels.length === 0 && (
            <p className="text-sm text-white/50">該当する結果が見つかりませんでした</p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-white/60">
            AIレコメンド（人気・新着ベース）
          </h3>
          <div className="grid grid-cols-3 gap-1">
            {recommend.map((r) => (
              <Link key={r.id} to={`/municipalities/${r.municipality.id}`} className="relative block">
                <video src={r.videoUrl} className="aspect-[9/16] w-full bg-neutral-800 object-cover" muted />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px]">
                  {r.municipality.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
