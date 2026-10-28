import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bookmark, Grid3x3, Heart, ImageDown, Settings, Users } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import Stamp from "../components/Stamp";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { formatStampDate } from "../lib/stampDate";
import { renderStampCard, shareOrDownload } from "../lib/stampCard";
import { showToast } from "../lib/toast";
import { PREFECTURES } from "../lib/regions";
import { useReelActions } from "../lib/useReelActions";
import type { Reel } from "../types";

interface StampItem {
  visitedAt: string;
  reel: { id: string; locationName: string; municipality: { id: string; name: string; prefecture: string } };
}

interface FollowItem {
  kind: "municipality" | "company";
  id: string;
  name: string;
  avatarUrl: string | null;
  municipalityId: string;
  place: string;
}

type Tab = "liked" | "saved" | "following";

function ReelTab({ reels, empty }: { reels: Reel[] | null; empty: string }) {
  const [items, setItems] = useState<Reel[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const actions = useReelActions(setItems);
  useEffect(() => setItems(reels ?? []), [reels]);

  if (!reels) {
    return (
      <div className="grid grid-cols-3 gap-px md:gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton aspect-square" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="px-6 py-12 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-px md:gap-1">
        {items.map((r) => (
          <ReelThumb key={r.id} reel={r} onOpen={(x) => setOpenId(x.id)} />
        ))}
      </div>
      {openId && (
        <ReelFullscreenViewer
          reels={items}
          initialId={openId}
          onClose={() => setOpenId(null)}
          onToggleLike={actions.toggleLike}
          onToggleSave={actions.toggleSave}
          onToggleFollow={actions.toggleFollow}
          onCommentCountChange={actions.setCommentCount}
        />
      )}
    </>
  );
}

// A traveler's own profile: travel stats, the スタンプ帳, and tabs for what
// they liked, saved to the しおり, and follow.
export default function MyPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("liked");
  const [liked, setLiked] = useState<Reel[] | null>(null);
  const [saved, setSaved] = useState<Reel[] | null>(null);
  const [following, setFollowing] = useState<FollowItem[] | null>(null);
  const [points, setPoints] = useState<{ points: number; reportCount: number; visitCount: number } | null>(null);
  const [stamps, setStamps] = useState<StampItem[] | null>(null);

  useEffect(() => {
    api.get<{ items: Reel[] }>("/reels/liked").then(({ data }) => setLiked(data.items));
    api.get<{ items: Reel[] }>("/reels/saved").then(({ data }) => setSaved(data.items));
    api.get<{ items: FollowItem[] }>("/auth/me/following").then(({ data }) => setFollowing(data.items));
    api.get("/auth/me/points").then(({ data }) => setPoints(data));
    api.get<{ items: StampItem[] }>("/auth/me/stamps").then(({ data }) => setStamps(data.items));
  }, []);

  const [makingCard, setMakingCard] = useState(false);

  // The スタンプ帳 as a story-sized image to post anywhere.
  async function shareStampCard() {
    if (!user || !stamps) return;
    setMakingCard(true);
    try {
      const prefectureCount = new Set(stamps.map((s) => s.reel.municipality.prefecture)).size;
      const blob = await renderStampCard(
        stamps.map((s) => ({ place: s.reel.locationName, date: formatStampDate(s.visitedAt) })),
        {
          title: t("stamps.cardTitle", { name: user.name }),
          stats: t("stamps.cardStats", { count: stamps.length, prefectures: prefectureCount }),
          more: (count) => t("stamps.cardMore", { count }),
          footer: t("stamps.cardFooter"),
        }
      );
      const result = await shareOrDownload(blob, "jaziba-stamps.png", t("stamps.cardTitle", { name: user.name }));
      if (result === "downloaded") showToast(t("stamps.cardSaved"));
    } catch {
      showToast(t("stamps.cardError"));
    } finally {
      setMakingCard(false);
    }
  }

  async function unfollow(f: FollowItem) {
    await api.delete(`/${f.kind === "municipality" ? "municipalities" : "companies"}/${f.id}/follow`);
    setFollowing((prev) => prev?.filter((x) => x !== f) ?? null);
  }

  if (!user) return null;

  const prefectures = [...new Set((stamps ?? []).map((s) => s.reel.municipality.prefecture))];
  const stats = [
    { label: t("myPage.statStamps"), value: stamps?.length },
    { label: t("myPage.statPrefectures"), value: stamps ? prefectures.length : undefined },
    { label: t("myPage.statSaved"), value: saved?.length },
    { label: t("myPage.statFollowing"), value: following?.length },
  ];
  const tabs: { key: Tab; icon: typeof Grid3x3; label: string }[] = [
    { key: "liked", icon: Heart, label: t("myPage.tabLiked") },
    { key: "saved", icon: Bookmark, label: t("myPage.tabSaved") },
    { key: "following", icon: Users, label: t("myPage.tabFollowing") },
  ];

  return (
    <div className="mx-auto max-w-[935px] py-6 md:px-5 md:py-8">
      <header className="px-4 md:px-0">
        <div className="flex items-center gap-5 md:gap-10">
          <Avatar name={user.name} src={user.avatarUrl} size={80} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-jz-ink">{user.name}</h1>
              <Link to="/settings" aria-label={t("nav.settings")} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
                <Settings className="h-5 w-5" />
              </Link>
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-1 text-center md:max-w-md">
              {stats.map((s) => (
                <div key={s.label}>
                  <dd className="text-lg font-extrabold tabular-nums text-jz-ink">{s.value ?? "–"}</dd>
                  <dt className="text-[11px] text-gray-500">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {stamps && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-jz-ink">{t("myPage.prefectureProgress")}</span>
              <span className="tabular-nums text-gray-500">
                {prefectures.length} / {PREFECTURES.length}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-jz-red transition-[width] duration-700"
                style={{ width: `${(prefectures.length / PREFECTURES.length) * 100}%` }}
              />
            </div>
            {prefectures.length > 0 && (
              <p className="mt-1.5 truncate text-[11px] text-gray-500">{prefectures.join("・")}</p>
            )}
          </div>
        )}

        {points && (
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-gray-100 px-4 py-3">
            <div>
              <p className="whitespace-nowrap text-xs font-semibold text-gray-500">{t("myPage.pointsLabel")}</p>
              <p className="text-2xl font-extrabold tabular-nums text-gray-900">{t("myPage.pointsValue", { points: points.points })}</p>
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              {t("myPage.pointsNote", { count: points.reportCount })}
              <br />
              {t("stamps.pointsNote", { count: points.visitCount })}
            </p>
          </div>
        )}

        <section className="mt-7">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-bold text-gray-900">
              {t("stamps.bookHeading")}
              {stamps && <span className="ml-2 font-normal text-gray-500">{t("stamps.count", { count: stamps.length })}</span>}
            </h2>
            {stamps && stamps.length > 0 && (
              <button
                type="button"
                onClick={() => void shareStampCard()}
                disabled={makingCard}
                className="inline-flex items-center gap-1.5 rounded-full bg-jz-tint px-3 py-1.5 text-xs font-bold text-jz-red transition active:scale-95 disabled:opacity-50"
              >
                <ImageDown className="h-3.5 w-3.5" /> {t("stamps.cardButton")}
              </button>
            )}
          </div>
          {stamps && stamps.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-500">{t("stamps.bookEmpty")}</p>
          ) : (
            <div className="scrollbar-none -mx-4 mt-3 flex gap-5 overflow-x-auto px-4 pb-2 pt-2 md:mx-0 md:flex-wrap md:px-0">
              {(stamps ?? []).map((s) => (
                <Link key={s.reel.id} to={`/reels/${s.reel.id}/access`} className="flex w-24 shrink-0 flex-col items-center gap-1.5 text-center">
                  <Stamp place={s.reel.locationName} date={formatStampDate(s.visitedAt)} size={92} />
                  <span className="w-full truncate text-[11px] text-gray-500">{s.reel.municipality.name}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </header>

      <div className="mt-6 border-t border-gray-200" role="tablist" aria-label={t("myPage.tabsLabel")}>
        <div className="flex justify-center gap-10 md:gap-14">
          {tabs.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mt-px flex items-center gap-1.5 border-t py-3 text-xs font-semibold tracking-wider ${
                tab === key ? "border-jz-ink text-jz-ink" : "border-transparent text-gray-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {tab === "liked" && <ReelTab reels={liked} empty={t("myPage.emptyLiked")} />}
        {tab === "saved" && <ReelTab reels={saved} empty={t("myPage.emptySaved")} />}
        {tab === "following" &&
          (following && following.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">{t("myPage.emptyFollowing")}</p>
          ) : (
            <ul className="mx-auto max-w-lg divide-y divide-gray-100 px-4 md:px-0">
              {(following ?? []).map((f) => (
                <li key={`${f.kind}-${f.id}`} className="flex items-center gap-3 py-3">
                  <Link to={`/municipalities/${f.municipalityId}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={f.name} src={f.avatarUrl} size={44} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-jz-ink">{f.name}</span>
                      <span className="block truncate text-xs text-gray-500">{f.place}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void unfollow(f)}
                    className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-jz-ink hover:bg-gray-200"
                  >
                    {t("myPage.unfollow")}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
      <p className="mt-8 px-4 text-center text-[11px] text-gray-500 md:px-0">{t("myPage.viewOnlyNotice")}</p>
    </div>
  );
}
