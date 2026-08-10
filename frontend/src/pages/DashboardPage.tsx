import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import AutoplayVideo from "../components/AutoplayVideo";
import type { Municipality, Reel, TourismSpot } from "../types";

// "アクセス方法・宿情報・飲食店" — still one free-text field each, edited via a
// plain textarea. 観光情報 (tourismInfo) used to be a 4th field in this same
// shape but is now a list of individually-editable spots (TourismSpotsEditor
// below), and 投稿 (posts) is the reel management grid, not a Municipality
// field at all — both get their own tab panel instead.
const TEXT_TAB_KEYS = ["accessInfo", "lodgingInfo", "restaurantInfo"] as const;
const TAB_KEYS = ["posts", "tourismInfo", ...TEXT_TAB_KEYS] as const;
type TabKey = (typeof TAB_KEYS)[number];

function TextInfoEditor({
  municipality,
  tabKey,
  onUpdated,
}: {
  municipality: Municipality;
  tabKey: (typeof TEXT_TAB_KEYS)[number];
  onUpdated: (m: Municipality) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(municipality[tabKey]);
  const [saving, setSaving] = useState(false);
  const label = t(
    tabKey === "accessInfo" ? "dashboard.tabAccess" : tabKey === "lodgingInfo" ? "dashboard.tabLodging" : "dashboard.tabRestaurant"
  );

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/municipalities/me/profile", { [tabKey]: value });
      onUpdated(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder={t("dashboard.tabPlaceholder", { label })}
        className="block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-teal-500"
      />
      <button
        onClick={save}
        disabled={saving}
        className="mt-2 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {t("dashboard.saveTab")}
      </button>
    </div>
  );
}

// 観光情報タブ: 自治体管轄内の観光スポットを1件ずつ登録・編集・削除できる
// CRUD一覧（旧・単一のtourismInfoフリーテキストを置き換え）。
function TourismSpotsEditor({ initialSpots }: { initialSpots: TourismSpot[] }) {
  const { t } = useTranslation();
  const [spots, setSpots] = useState(initialSpots);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addSpot(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/municipalities/me/tourism-spots", {
        name: newName.trim(),
        description: newDescription.trim(),
      });
      setSpots((prev) => [...prev, data]);
      setNewName("");
      setNewDescription("");
      setAdding(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("dashboard.spotSaveError"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(spot: TourismSpot) {
    setEditingId(spot.id);
    setEditName(spot.name);
    setEditDescription(spot.description);
    setError(null);
  }

  async function saveEdit(spotId: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put(`/municipalities/me/tourism-spots/${spotId}`, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setSpots((prev) => prev.map((s) => (s.id === spotId ? data : s)));
      setEditingId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("dashboard.spotSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSpot(spotId: string) {
    await api.delete(`/municipalities/me/tourism-spots/${spotId}`);
    setSpots((prev) => prev.filter((s) => s.id !== spotId));
  }

  return (
    <div className="p-4 lg:p-6">
      <p className="text-xs text-gray-400">{t("dashboard.spotsDescription")}</p>

      <div className="mt-3 flex flex-col gap-3">
        {spots.map((spot) =>
          editingId === spot.id ? (
            <div key={spot.id} className="flex flex-col gap-2 rounded-lg border border-teal-500 p-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("dashboard.spotNamePlaceholder")}
                className="rounded-lg border border-gray-300 p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder={t("dashboard.spotDescriptionPlaceholder")}
                className="rounded-lg border border-gray-300 p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(spot.id)}
                  disabled={saving || !editName.trim()}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {t("dashboard.saveTab")}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  {t("dashboard.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div key={spot.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{spot.name}</p>
                {spot.description && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{spot.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-3">
                <button onClick={() => startEdit(spot)} className="text-xs font-medium text-teal-600 hover:text-teal-700">
                  {t("dashboard.editSpot")}
                </button>
                <button onClick={() => deleteSpot(spot.id)} className="text-xs font-medium text-red-500 hover:text-red-600">
                  {t("dashboard.deleteSpot")}
                </button>
              </div>
            </div>
          )
        )}
        {spots.length === 0 && !adding && (
          <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
            {t("dashboard.noSpots")}
          </p>
        )}
      </div>

      {adding ? (
        <form onSubmit={addSpot} className="mt-3 flex flex-col gap-2 rounded-lg border border-teal-500 p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("dashboard.spotNamePlaceholder")}
            className="rounded-lg border border-gray-300 p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={3}
            placeholder={t("dashboard.spotDescriptionPlaceholder")}
            className="rounded-lg border border-gray-300 p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {t("dashboard.addSpot")}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {t("dashboard.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 hover:border-teal-400 hover:text-teal-500"
        >
          ＋ {t("dashboard.addSpot")}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function MaasStationEditor({
  municipality,
  onUpdated,
}: {
  municipality: Municipality;
  onUpdated: (m: Municipality) => void;
}) {
  const { t } = useTranslation();
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
      setError(err?.response?.data?.error ?? t("dashboard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-t border-gray-200 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-600">{t("dashboard.maasHeading")}</h3>
        {municipality.maasConfigured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            {t("dashboard.maasReal")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {t("dashboard.maasMock")}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400">{t("dashboard.maasDescription")}</p>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("dashboard.stationPlaceholder")}
          className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
        />
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {t("dashboard.save")}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function PostsGrid({
  reels,
  onUpload,
  onDelete,
}: {
  reels: Reel[];
  onUpload: () => void;
  onDelete: (reelId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 p-3 lg:grid-cols-4 lg:gap-3 lg:p-4">
      <button
        onClick={onUpload}
        className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-300 hover:border-teal-400 hover:text-teal-500"
      >
        <span className="text-4xl leading-none">＋</span>
      </button>
      {reels.map((reel) => (
        <div key={reel.id} className="group relative overflow-hidden rounded-lg">
          <video src={reel.videoUrl} className="aspect-square w-full bg-gray-200 object-cover" muted />
          {reel.postedByCompany && (
            <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
              {t("dashboard.postedBy", { name: reel.postedByCompany.name })}
            </p>
          )}
          <button
            onClick={() => onDelete(reel.id)}
            className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100"
          >
            {t("dashboard.deleteReel")}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { municipality, setMunicipality } = useAuth();
  const { t } = useTranslation();
  const [reels, setReels] = useState<Reel[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [tab, setTab] = useState<TabKey>("posts");

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

  async function deleteReel(reelId: string) {
    await api.delete(`/reels/${reelId}`);
    setReels((prev) => prev.filter((r) => r.id !== reelId));
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "posts", label: t("dashboard.tabPosts") },
    { key: "tourismInfo", label: t("dashboard.tabTourism") },
    { key: "accessInfo", label: t("dashboard.tabAccess") },
    { key: "lodgingInfo", label: t("dashboard.tabLodging") },
    { key: "restaurantInfo", label: t("dashboard.tabRestaurant") },
  ];

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
              {t("dashboard.avatarChange")}
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
            {t("dashboard.officialBadge")}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {municipality.prefecture} {t("dashboard.manageScreen")}
        </p>

        <div className="mt-3 flex gap-4 border-b border-gray-200 pb-3 text-sm text-gray-600">
          <span>
            <b className="text-gray-900">{reels.length}</b>
            {t("dashboard.postsCount")}
          </span>
          <span>
            <b className="text-gray-900">{companies.length}</b>
            {t("dashboard.companiesCount")}
          </span>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 py-3 text-xs font-medium hover:bg-teal-50/50 lg:text-sm ${
              tab === tabItem.key ? "border-b-2 border-teal-500 text-gray-900" : "text-gray-500"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <PostsGrid reels={featured ? rest : []} onUpload={() => setShowUploader(true)} onDelete={deleteReel} />
      )}
      {tab === "tourismInfo" && (
        <TourismSpotsEditor key={municipality.id} initialSpots={municipality.tourismSpots} />
      )}
      {TEXT_TAB_KEYS.includes(tab as (typeof TEXT_TAB_KEYS)[number]) && (
        <TextInfoEditor
          key={tab}
          municipality={municipality}
          tabKey={tab as (typeof TEXT_TAB_KEYS)[number]}
          onUpdated={setMunicipality}
        />
      )}

      <MaasStationEditor municipality={municipality} onUpdated={setMunicipality} />

      <div className="border-t border-gray-200 p-4 lg:p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">
          {t("dashboard.linkedCompaniesHeading", { count: companies.length })}
        </h3>
        {companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            {t("dashboard.noLinkedCompanies")}
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
                setTab("posts");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
