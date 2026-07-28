import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AutoplayVideo from "../components/AutoplayVideo";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import type { Municipality, Reel } from "../types";

const TAB_KEYS = ["tourismInfo", "accessInfo", "lodgingInfo", "restaurantInfo"] as const;

function formatDate(iso: string, language: string) {
  return new Intl.DateTimeFormat(language, { year: "numeric", month: "long" }).format(new Date(iso));
}

export default function MunicipalityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const tabs = [
    { key: "tourismInfo", label: t("dashboard.tabTourism") },
    { key: "accessInfo", label: t("dashboard.tabAccess") },
    { key: "lodgingInfo", label: t("dashboard.tabLodging") },
    { key: "restaurantInfo", label: t("dashboard.tabRestaurant") },
  ] as const satisfies { key: (typeof TAB_KEYS)[number]; label: string }[];
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("tourismInfo");
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

  async function toggleSave(reel: Reel) {
    if (!token) return;
    if (reel.savedByMe) {
      await api.delete(`/reels/${reel.id}/save`);
    } else {
      await api.post(`/reels/${reel.id}/save`);
    }
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: !r.savedByMe } : r)));
  }

  async function toggleFollowMunicipality() {
    if (!token || !municipality) return;
    if (municipality.isFollowing) {
      await api.delete(`/municipalities/${municipality.id}/follow`);
    } else {
      await api.post(`/municipalities/${municipality.id}/follow`);
    }
    setMunicipality((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !prev.isFollowing,
            followerCount: prev.followerCount + (prev.isFollowing ? -1 : 1),
          }
        : prev
    );
    setReels((prev) =>
      prev.map((r) =>
        r.municipality.id === municipality.id
          ? { ...r, municipality: { ...r.municipality, isFollowing: !municipality.isFollowing } }
          : r
      )
    );
  }

  function toggleFollowFromReel(reel: Reel) {
    if (reel.postedByCompany) {
      // Company-posted reels shown here are managed via the reel viewer's own
      // follow button; the profile page itself only tracks municipality follow.
      if (!token) return;
      const isFollowing = reel.postedByCompany.isFollowing;
      const request = isFollowing
        ? api.delete(`/companies/${reel.postedByCompany.id}/follow`)
        : api.post(`/companies/${reel.postedByCompany.id}/follow`);
      request.then(() => {
        setReels((prev) =>
          prev.map((r) =>
            r.postedByCompany?.id === reel.postedByCompany!.id
              ? { ...r, postedByCompany: { ...r.postedByCompany!, isFollowing: !isFollowing } }
              : r
          )
        );
      });
    } else {
      toggleFollowMunicipality();
    }
  }

  if (!municipality) return <p className="p-10 text-center text-gray-400">{t("municipalityProfile.loading")}</p>;

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
            {t("municipalityProfile.officialBadge")}
          </span>
          {token && (
            <button
              onClick={toggleFollowMunicipality}
              className={`ml-auto rounded-full px-4 py-1.5 text-sm font-medium ${
                municipality.isFollowing
                  ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  : "bg-teal-600 text-white hover:bg-teal-700"
              }`}
            >
              {municipality.isFollowing ? t("municipalityProfile.following") : t("municipalityProfile.follow")}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {t("municipalityProfile.followerCount", { count: municipality.followerCount })}
        </p>

        {municipality.description && <p className="mt-2 text-sm text-gray-800">{municipality.description}</p>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>📍 {municipality.prefecture}</span>
          <span>
            📅 {formatDate(municipality.createdAt, i18n.language)}
            {t("municipalityProfile.since")}
          </span>
        </div>

        <div className="mt-3 flex gap-4 border-b border-gray-200 pb-3 text-sm text-gray-600">
          <span>
            <b className="text-gray-900">{reels.length}</b>
            {t("municipalityProfile.postsCount")}
          </span>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 py-3 text-sm font-medium hover:bg-teal-50/50 ${
              tab === tabItem.key ? "border-b-2 border-teal-500 text-gray-900" : "text-gray-500"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>
      <div className="whitespace-pre-wrap border-b border-gray-200 p-4 text-sm text-gray-700 lg:p-6">
        {municipality[tab] || t("municipalityProfile.noInfo")}
      </div>

      {tab === "accessInfo" && municipality.nearestStationName && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 lg:px-6">
          <span>{t("municipalityProfile.stationLabel", { name: municipality.nearestStationName })}</span>
          {municipality.maasConfigured ? (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
              {t("municipalityProfile.realData")}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
              {t("municipalityProfile.mockData")}
            </span>
          )}
        </div>
      )}

      {municipality.otaLinks.length > 0 && (
        <div className="border-b border-gray-200 p-4 lg:p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">{t("municipalityProfile.otaHeading")}</h2>
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
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollowFromReel}
        />
      )}
    </div>
  );
}
