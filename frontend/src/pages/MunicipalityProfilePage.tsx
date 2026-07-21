import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AutoplayVideo from "../components/AutoplayVideo";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import type { Municipality, Reel } from "../types";

const TABS = [
  { key: "tourismInfo", label: "観光情報" },
  { key: "accessInfo", label: "アクセス方法" },
  { key: "lodgingInfo", label: "宿情報" },
  { key: "restaurantInfo", label: "飲食店" },
] as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default function MunicipalityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/municipalities/${id}`).then(({ data }) => {
      setMunicipality(data);
      setReels(data.reels ?? []);
    });
  }, [id]);

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

  if (!municipality) return <p className="p-10 text-center text-gray-400">読み込み中...</p>;

  const featured = reels[0];

  return (
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:max-w-4xl">
      <div className="relative aspect-[3/1] w-full bg-gradient-to-br from-teal-100 to-cyan-100">
        {featured && <AutoplayVideo src={featured.videoUrl} className="h-full w-full object-cover" />}
      </div>

      <div className="px-4 lg:px-6">
        <div className="-mt-10 flex items-end justify-between lg:-mt-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700 ring-4 ring-white lg:h-24 lg:w-24">
            {municipality.avatarUrl ? (
              <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
            ) : (
              municipality.name.slice(0, 1)
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{municipality.name}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            🏛️ 自治体公式
          </span>
        </div>

        {municipality.description && <p className="mt-2 text-sm text-gray-800">{municipality.description}</p>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>📍 {municipality.prefecture}</span>
          <span>📅 {formatDate(municipality.createdAt)}から掲載</span>
        </div>

        <div className="mt-3 flex gap-4 border-b border-gray-200 pb-3 text-sm text-gray-600">
          <span>
            <b className="text-gray-900">{reels.length}</b> 件の投稿
          </span>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium hover:bg-teal-50/50 ${
              tab === t.key ? "border-b-2 border-teal-500 text-gray-900" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="whitespace-pre-wrap border-b border-gray-200 p-4 text-sm text-gray-700 lg:p-6">
        {municipality[tab] || "情報が未登録です"}
      </div>

      {municipality.otaLinks.length > 0 && (
        <div className="border-b border-gray-200 p-4 lg:p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">宿・予約を探す</h2>
          <div className="flex flex-col gap-2 lg:flex-row">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:border-teal-300 hover:bg-teal-50"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3">
        {reels.map((reel) => (
          <ReelThumb key={reel.id} reel={reel} onOpen={(r) => setOpenReelId(r.id)} />
        ))}
      </div>

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
