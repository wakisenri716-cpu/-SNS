import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import type { Municipality, Reel } from "../types";

const TABS = [
  { key: "tourismInfo", label: "観光情報" },
  { key: "accessInfo", label: "アクセス方法" },
  { key: "lodgingInfo", label: "宿情報" },
  { key: "restaurantInfo", label: "飲食店" },
] as const;

interface LinkedCompany {
  id: string;
  name: string;
  createdAt: string;
}

function ProfileTabEditor({
  municipality,
  onUpdated,
}: {
  municipality: Municipality;
  onUpdated: (m: Municipality) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");
  const [value, setValue] = useState(municipality[tab]);
  const [saving, setSaving] = useState(false);

  function selectTab(key: (typeof TABS)[number]["key"]) {
    setTab(key);
    setValue(municipality[key]);
  }

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/municipalities/me/profile", { [tab]: value });
      onUpdated(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder={`${TABS.find((t) => t.key === tab)!.label}を入力`}
        className="mt-3 block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-blue-500"
      />
      <button
        onClick={save}
        disabled={saving}
        className="mt-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        この項目を保存
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { municipality, setMunicipality } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [companies, setCompanies] = useState<LinkedCompany[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    if (!municipality) return;
    api.get("/reels/mine").then(({ data }) => setReels(data.items));
    api.get("/municipalities/me/companies").then(({ data }) => setCompanies(data));
  }, [municipality?.id]);

  if (!municipality) return null;

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append("avatar", file);
    const { data } = await api.post("/municipalities/me/avatar", fd);
    setMunicipality(data);
  }

  const [featured, ...rest] = reels;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        <label className="group relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
          {municipality.avatarUrl ? (
            <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            municipality.name.slice(0, 1)
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] text-white opacity-0 group-hover:opacity-100">
            変更
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar(file);
            }}
          />
        </label>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{municipality.name} 管理画面</h1>
          <p className="text-sm text-gray-500">{municipality.prefecture}</p>
        </div>
      </div>

      {featured ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
          <video src={featured.videoUrl} className="aspect-video w-full bg-black object-cover" muted controls />
          {featured.postedByCompany && (
            <p className="bg-gray-50 px-3 py-1.5 text-xs text-gray-500">投稿: {featured.postedByCompany.name}</p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowUploader(true)}
          className="mt-5 flex aspect-video w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
        >
          <span className="text-5xl leading-none">＋</span>
        </button>
      )}

      <div className="mt-4">
        <ProfileTabEditor municipality={municipality} onUpdated={setMunicipality} />
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">
          投稿一覧（{reels.length}件・紐づく企業の投稿を含む）
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowUploader(true)}
            className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
          >
            <span className="text-4xl leading-none">＋</span>
          </button>
          {(featured ? rest : []).map((reel) => (
            <div key={reel.id} className="group relative overflow-hidden rounded-lg">
              <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
              {reel.postedByCompany && (
                <p className="truncate bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
                  投稿: {reel.postedByCompany.name}
                </p>
              )}
              <button
                onClick={async () => {
                  await api.delete(`/reels/${reel.id}`);
                  setReels((prev) => prev.filter((r) => r.id !== reel.id));
                }}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">紐づいている企業（{companies.length}件）</h3>
        {companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            まだこの自治体に紐づいた企業アカウントはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {companies.map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showUploader && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setShowUploader(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <ReelUploader
              onCreated={(reel) => {
                setReels((prev) => [reel, ...prev]);
                setShowUploader(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
