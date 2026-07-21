import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import AutoplayVideo from "../components/AutoplayVideo";
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
    <>
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium hover:bg-teal-50/50 ${
              tab === t.key ? "border-b-2 border-teal-500 text-gray-900" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="border-b border-gray-200 p-4 lg:p-6">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder={`${TABS.find((t) => t.key === tab)!.label}を入力`}
          className="block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-teal-500"
        />
        <button
          onClick={save}
          disabled={saving}
          className="mt-2 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          この項目を保存
        </button>
      </div>
    </>
  );
}

function MaasStationEditor({
  municipality,
  onUpdated,
}: {
  municipality: Municipality;
  onUpdated: (m: Municipality) => void;
}) {
  const [value, setValue] = useState(municipality.nearestStationName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put("/municipalities/me/profile", { nearestStationName: value });
      onUpdated(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-gray-200 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-600">MaaS（交通案内）起点駅</h3>
        {municipality.maasConfigured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            🗺️ 実際の経路データを使用中
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            現在は仮データです（Google Maps APIキー未設定）
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        投稿の位置情報までの所要時間の起点となる駅・バス停名を設定してください。
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 〇〇駅"
          className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
        />
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          保存
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:max-w-4xl">
      <div className="relative aspect-[3/1] w-full bg-gradient-to-br from-teal-100 to-cyan-100">
        {featured ? (
          <AutoplayVideo src={featured.videoUrl} className="h-full w-full object-cover" />
        ) : (
          <button
            onClick={() => setShowUploader(true)}
            className="flex h-full w-full items-center justify-center text-teal-400 hover:text-teal-500"
          >
            <span className="text-5xl leading-none">＋</span>
          </button>
        )}
      </div>

      <div className="px-4 lg:px-6">
        <div className="-mt-10 flex items-end justify-between lg:-mt-12">
          <label className="group relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700 ring-4 ring-white lg:h-24 lg:w-24">
            {municipality.avatarUrl ? (
              <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
            ) : (
              municipality.name.slice(0, 1)
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 group-hover:opacity-100">
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
        </div>

        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{municipality.name}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            🏛️ 自治体公式
          </span>
        </div>
        <p className="text-sm text-gray-500">{municipality.prefecture} ・管理画面</p>

        <div className="mt-3 flex gap-4 border-b border-gray-200 pb-3 text-sm text-gray-600">
          <span>
            <b className="text-gray-900">{reels.length}</b> 件の投稿（企業投稿含む）
          </span>
          <span>
            <b className="text-gray-900">{companies.length}</b> 件の紐づく企業
          </span>
        </div>
      </div>

      <ProfileTabEditor municipality={municipality} onUpdated={setMunicipality} />

      <MaasStationEditor municipality={municipality} onUpdated={setMunicipality} />

      <div className="grid grid-cols-3 gap-2 p-3 lg:grid-cols-4 lg:gap-3 lg:p-4">
        <button
          onClick={() => setShowUploader(true)}
          className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-300 hover:border-teal-400 hover:text-teal-500"
        >
          <span className="text-4xl leading-none">＋</span>
        </button>
        {(featured ? rest : []).map((reel) => (
          <div key={reel.id} className="group relative overflow-hidden rounded-lg">
            <video src={reel.videoUrl} className="aspect-square w-full bg-gray-200 object-cover" muted />
            {reel.postedByCompany && (
              <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                投稿: {reel.postedByCompany.name}
              </p>
            )}
            <button
              onClick={async () => {
                await api.delete(`/reels/${reel.id}`);
                setReels((prev) => prev.filter((r) => r.id !== reel.id));
              }}
              className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100"
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 p-4 lg:p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">紐づいている企業（{companies.length}件）</h3>
        {companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            まだこの自治体に紐づいた企業アカウントはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
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
