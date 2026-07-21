import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import AutoplayVideo from "../components/AutoplayVideo";
import type { Municipality } from "../types";

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
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");

  useEffect(() => {
    api.get(`/municipalities/${id}`).then(({ data }) => setMunicipality(data));
  }, [id]);

  if (!municipality) return <p className="p-10 text-center text-gray-400">読み込み中...</p>;

  const [featured, ...rest] = municipality.reels ?? [];

  return (
    <div className="mx-auto max-w-2xl border-x border-gray-200 bg-white">
      <div className="relative aspect-[3/1] w-full bg-gray-200">
        {featured ? (
          <AutoplayVideo src={featured.videoUrl} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-200 to-gray-300" />
        )}
      </div>

      <div className="px-4">
        <div className="-mt-10 flex items-end justify-between">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-2xl font-semibold text-gray-600 ring-4 ring-white">
            {municipality.avatarUrl ? (
              <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
            ) : (
              municipality.name.slice(0, 1)
            )}
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-xl font-bold text-gray-900">{municipality.name}</h1>
          <p className="text-sm text-gray-500">@{municipality.prefecture}</p>
        </div>

        {municipality.description && <p className="mt-3 text-sm text-gray-800">{municipality.description}</p>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>📍 {municipality.prefecture}</span>
          <span>📅 {formatDate(municipality.createdAt)}から掲載</span>
        </div>

        <div className="mt-3 flex gap-4 border-b border-gray-200 pb-3 text-sm text-gray-600">
          <span>
            <b className="text-gray-900">{municipality.reels?.length ?? 0}</b> 件の投稿
          </span>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium hover:bg-gray-50 ${
              tab === t.key ? "border-b-2 border-blue-500 text-gray-900" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="whitespace-pre-wrap border-b border-gray-200 p-4 text-sm text-gray-700">
        {municipality[tab] || "情報が未登録です"}
      </div>

      {municipality.otaLinks.length > 0 && (
        <div className="border-b border-gray-200 p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">宿・予約を探す</h2>
          <div className="flex flex-col gap-2">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {(featured ? rest : []).map((reel) => (
          <div key={reel.id} className="relative overflow-hidden">
            <video src={reel.videoUrl} className="aspect-square w-full bg-gray-200 object-cover" muted />
            {reel.postedByCompany && (
              <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                投稿: {reel.postedByCompany.name}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
