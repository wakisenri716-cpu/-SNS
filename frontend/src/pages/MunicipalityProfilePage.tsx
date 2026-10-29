import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { fetchSavedReelIds, onSavesChanged } from "../lib/savesChanged";
import { chooseTrips } from "../lib/trips";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import UpcomingEvents from "../components/UpcomingEvents";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import AccessPlannerForm from "../components/AccessPlannerForm";
import type { Municipality, Reel } from "../types";
import {
  ArrowUpRight,
  BadgeCheck,
  BedDouble,
  CalendarDays,
  Grid3x3,
  Landmark,
  MapPin,
  TrainFront,
  UtensilsCrossed,
} from "lucide-react";

const TAB_KEYS = ["posts", "events", "tourismInfo", "accessInfo", "lodgingInfo", "restaurantInfo"] as const;

function formatDate(iso: string, language: string) {
  return new Intl.DateTimeFormat(language, { year: "numeric", month: "long" }).format(new Date(iso));
}

// Lets a visitor type in their own starting point and see an estimated
// time/mode/fare to reach this municipality — a one-shot, user-initiated
// lookup (GET /municipalities/:id/access-plan), unlike the automatic
// per-reel-view MaaS calls elsewhere in the app.
function AccessPlanner({
  municipalityId,
  stationConfigured,
}: {
  municipalityId: string;
  stationConfigured: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">{t("accessPlanner.heading")}</h2>
      <p className="mb-2 text-xs text-gray-500">{t("accessPlanner.description")}</p>
      {!stationConfigured ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-500">
          {t("accessPlanner.stationNotConfigured")}
        </p>
      ) : (
        <AccessPlannerForm endpoint={`/municipalities/${municipalityId}/access-plan`} />
      )}
    </div>
  );
}

export default function MunicipalityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const tabs = [
    { key: "posts", label: t("dashboard.tabPosts"), icon: Grid3x3 },
    { key: "events", label: t("events.tab"), icon: CalendarDays },
    { key: "tourismInfo", label: t("dashboard.tabTourism"), icon: Landmark },
    { key: "accessInfo", label: t("dashboard.tabAccess"), icon: TrainFront },
    { key: "lodgingInfo", label: t("dashboard.tabLodging"), icon: BedDouble },
    { key: "restaurantInfo", label: t("dashboard.tabRestaurant"), icon: UtensilsCrossed },
  ] as const satisfies { key: (typeof TAB_KEYS)[number]; label: string; icon: unknown }[];
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("posts");
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/municipalities/${id}`).then(({ data }) => {
      setMunicipality(data);
      setReels(data.reels ?? []);
    });
  }, [id]);

  // See FeedPage: re-sync savedByMe after saves/unsaves made elsewhere.
  useEffect(() => {
    if (!token) return;
    return onSavesChanged(async () => {
      const ids = await fetchSavedReelIds();
      setReels((prev) => prev.map((r) => ({ ...r, savedByMe: ids.has(r.id) })));
    });
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

  async function toggleSave(reel: Reel) {
    if (!token) return;
    const saved = await chooseTrips([reel.id], reel.locationName || reel.municipality.name);
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: saved } : r)));
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

  if (!municipality) return <p className="p-10 text-center text-gray-500">{t("municipalityProfile.loading")}</p>;

  return (
    <div className="mx-auto w-full max-w-[935px] bg-white md:px-5 md:pt-8">
      <header className="px-4 pt-4 md:flex md:items-start md:gap-16 md:px-12 md:pb-10">
        <div className="flex items-center gap-6 md:block">
          <span className="md:hidden">
            <Avatar name={municipality.name} src={municipality.avatarUrl} size={86} ring spin />
          </span>
          <span className="hidden md:block">
            <Avatar name={municipality.name} src={municipality.avatarUrl} size={150} ring spin />
          </span>
          <div className="flex flex-1 justify-around text-center text-sm md:hidden">
            <span>
              <b className="block text-base font-semibold text-gray-900">{reels.length}</b>
              <span className="text-gray-900">{t("municipalityProfile.postsLabel")}</span>
            </span>
            <span>
              <b className="block text-base font-semibold text-gray-900">{municipality.followerCount}</b>
              <span className="text-gray-900">{t("municipalityProfile.followersLabel")}</span>
            </span>
          </div>
        </div>

        <div className="mt-3 min-w-0 flex-1 md:mt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="flex items-center gap-1.5 text-xl text-gray-900">
              {municipality.name}
              <BadgeCheck className="h-5 w-5 fill-jz-red text-white" aria-label={t("municipalityProfile.officialBadge")} />
            </h1>
            {token && (
              <button
                onClick={toggleFollowMunicipality}
                className={`hidden rounded-lg px-5 py-1.5 text-sm font-semibold md:block ${
                  municipality.isFollowing
                    ? "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    : "bg-jz-red text-white hover:bg-jz-red-dark"
                }`}
              >
                {municipality.isFollowing ? t("municipalityProfile.following") : t("municipalityProfile.follow")}
              </button>
            )}
          </div>

          <div className="mt-5 hidden gap-10 text-base text-gray-900 md:flex">
            <span>
              <b className="font-semibold">{reels.length}</b> {t("municipalityProfile.postsLabel")}
            </span>
            <span>
              <b className="font-semibold">{municipality.followerCount}</b> {t("municipalityProfile.followersLabel")}
            </span>
          </div>

          <div className="mt-1 text-sm text-gray-900 md:mt-5">
            <p className="text-xs text-gray-500">{t("municipalityProfile.officialBadge")}</p>
            {municipality.description && <p className="mt-1 whitespace-pre-wrap">{municipality.description}</p>}
            <p className="mt-1 flex flex-wrap gap-x-3 text-gray-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {municipality.prefecture}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(municipality.createdAt, i18n.language)}
                {t("municipalityProfile.since")}
              </span>
            </p>
          </div>

          {token && (
            <button
              onClick={toggleFollowMunicipality}
              className={`mt-4 w-full rounded-lg py-1.5 text-sm font-semibold md:hidden ${
                municipality.isFollowing ? "bg-gray-100 text-gray-900" : "bg-jz-red text-white"
              }`}
            >
              {municipality.isFollowing ? t("municipalityProfile.following") : t("municipalityProfile.follow")}
            </button>
          )}
        </div>
      </header>

      {/* Instagram-style tab strip: the active tab gets a top rule. */}
      <div className="scrollbar-none mt-4 flex overflow-x-auto border-t border-gray-200 md:mt-0 md:justify-center md:gap-12">
        {tabs.map(({ key, label, icon: TabIcon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`-mt-px flex min-w-[4.25rem] flex-1 shrink-0 flex-col items-center gap-1 whitespace-nowrap border-t px-1.5 py-2.5 text-[11px] font-semibold md:flex-none md:flex-row md:gap-1.5 md:py-4 md:text-xs md:tracking-wider ${
              tab === key ? "border-jz-red text-jz-ink" : "border-transparent text-gray-500 hover:text-gray-600"
            }`}
          >
            <TabIcon className="h-5 w-5 md:h-3.5 md:w-3.5" strokeWidth={tab === key ? 2.4 : 1.8} />
            {label}
          </button>
        ))}
      </div>
      {tab === "posts" ? (
        reels.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-gray-500">{t("municipalityProfile.noPosts")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-px md:gap-1">
            {reels.map((reel) => (
              <ReelThumb key={reel.id} reel={reel} onOpen={(r) => setOpenReelId(r.id)} />
            ))}
          </div>
        )
      ) : tab === "events" ? (
        <UpcomingEvents municipalityId={municipality.id} layout="list" />
      ) : tab === "tourismInfo" ? (
        <div className="border-b border-gray-200 p-4 lg:p-6">
          {municipality.tourismSpots.length === 0 ? (
            <p className="text-sm text-gray-500">{t("municipalityProfile.noSpots")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {municipality.tourismSpots.map((spot) => (
                <div key={spot.id}>
                  <h3 className="text-sm font-bold text-gray-900">{spot.name}</h3>
                  {spot.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{spot.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap border-b border-gray-200 p-4 text-sm text-gray-700 lg:p-6">
          {municipality[tab] || t("municipalityProfile.noInfo")}
        </div>
      )}

      {tab === "accessInfo" && (
        <>
          {municipality.nearestStationName && (
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 lg:px-6">
              <span>{t("municipalityProfile.stationLabel", { name: municipality.nearestStationName })}</span>
              {municipality.maasConfigured ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                  {t("municipalityProfile.realData")}
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
                  {t("municipalityProfile.mockData")}
                </span>
              )}
            </div>
          )}
          <AccessPlanner municipalityId={municipality.id} stationConfigured={!!municipality.nearestStationName} />
        </>
      )}

      {tab === "lodgingInfo" && municipality.otaLinks.length > 0 && (
        <div className="border-b border-gray-200 p-4 lg:p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">{t("municipalityProfile.otaHeading")}</h2>
          <div className="flex flex-col gap-2 lg:flex-row">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:border-gray-300 hover:bg-gray-100"
              >
                {link.label} <ArrowUpRight className="inline h-3.5 w-3.5 align-[-2px]" />
              </a>
            ))}
          </div>
        </div>
      )}

      {openReelId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openReelId}
          onClose={() => setOpenReelId(null)}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollowFromReel}
          onCommentCountChange={(reelId, count) =>
            setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, commentCount: count } : r)))
          }
        />
      )}
    </div>
  );
}
