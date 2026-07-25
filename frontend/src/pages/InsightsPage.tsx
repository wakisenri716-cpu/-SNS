import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { REEL_CATEGORIES, type Reel } from "../types";

type SortKey = "views" | "likes" | "comments" | "date";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

export default function InsightsPage() {
  const { municipality, company } = useAuth();
  const { t, i18n } = useTranslation();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("views");

  useEffect(() => {
    setLoading(true);
    api
      .get("/reels/mine")
      .then(({ data }: { data: { items: Reel[] } }) => setReels(data.items))
      .finally(() => setLoading(false));
  }, [municipality?.id, company?.id]);

  const totals = useMemo(
    () =>
      reels.reduce(
        (acc, r) => ({
          views: acc.views + r.viewCount,
          likes: acc.likes + r.likeCount,
          comments: acc.comments + r.commentCount,
        }),
        { views: 0, likes: 0, comments: 0 }
      ),
    [reels]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { views: number; likes: number; comments: number; count: number }>();
    for (const c of REEL_CATEGORIES) map.set(c, { views: 0, likes: 0, comments: 0, count: 0 });
    for (const r of reels) {
      const entry = map.get(r.category);
      if (!entry) continue;
      entry.views += r.viewCount;
      entry.likes += r.likeCount;
      entry.comments += r.commentCount;
      entry.count += 1;
    }
    return REEL_CATEGORIES.map((c) => ({ category: c, ...map.get(c)! }));
  }, [reels]);

  const maxCategoryViews = Math.max(1, ...byCategory.map((c) => c.views));

  const sortedReels = useMemo(() => {
    const copy = [...reels];
    copy.sort((a, b) => {
      if (sortKey === "views") return b.viewCount - a.viewCount;
      if (sortKey === "likes") return b.likeCount - a.likeCount;
      if (sortKey === "comments") return b.commentCount - a.commentCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return copy;
  }, [reels, sortKey]);

  if (!municipality && !company) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t("insights.heading")}</h2>
        <p className="text-sm text-gray-500">{t("insights.subheading")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t("insights.loading")}</p>
      ) : reels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          {t("insights.empty")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label={t("insights.totalPosts")} value={reels.length} />
            <SummaryCard label={t("insights.totalViews")} value={totals.views} />
            <SummaryCard label={t("insights.totalLikes")} value={totals.likes} />
            <SummaryCard label={t("insights.totalComments")} value={totals.comments} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-600">{t("insights.byCategoryHeading")}</h3>
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
              {byCategory.map((c) => (
                <div key={c.category} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-gray-600">{t(`category.${c.category}`)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${(c.views / maxCategoryViews) * 100}%` }}
                    />
                  </div>
                  <span className="w-40 shrink-0 text-right text-xs text-gray-400">
                    {t("insights.categoryStats", { count: c.count, views: c.views, likes: c.likes, comments: c.comments })}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">{t("insights.byReelHeading")}</h3>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-teal-500"
              >
                <option value="views">{t("insights.sortViews")}</option>
                <option value="likes">{t("insights.sortLikes")}</option>
                <option value="comments">{t("insights.sortComments")}</option>
                <option value="date">{t("insights.sortDate")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              {sortedReels.map((reel) => (
                <div key={reel.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2">
                  <video
                    src={reel.videoUrl}
                    className="aspect-square h-14 w-14 shrink-0 rounded-lg bg-gray-200 object-cover"
                    muted
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{reel.caption || t("reelManageGrid.untitled")}</p>
                    <p className="truncate text-xs text-gray-400">
                      {t(`category.${reel.category}`)} · {new Date(reel.createdAt).toLocaleDateString(i18n.language)}
                      {reel.postedByCompany && ` · ${t("dashboard.postedBy", { name: reel.postedByCompany.name })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-gray-500">
                    <span>👁 {reel.viewCount}</span>
                    <span>❤️ {reel.likeCount}</span>
                    <span>💬 {reel.commentCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
