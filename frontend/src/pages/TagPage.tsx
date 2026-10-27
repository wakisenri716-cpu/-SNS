import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import ReelThumb from "../components/ReelGrid";
import ReelFullscreenViewer from "../components/ReelFullscreenViewer";
import { useReelActions } from "../lib/useReelActions";
import { REEL_CATEGORIES, TRAVELER_TAGS, type Reel } from "../types";

// A tag's page (#自然, #カップル向け …): every post with that category or
// traveler tag as a grid, plus the other tags to hop to.
export default function TagPage() {
  const { kind, value } = useParams<{ kind: string; value: string }>();
  const { t } = useTranslation();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const actions = useReelActions(setReels);

  const isCategory = kind === "category" && (REEL_CATEGORIES as readonly string[]).includes(value ?? "");
  const isTraveler = kind === "traveler" && (TRAVELER_TAGS as readonly string[]).includes(value ?? "");
  const label = isCategory ? t(`category.${value}`) : isTraveler ? t(`travelerTag.${value}`) : "";

  useEffect(() => {
    setLoaded(false);
    const request = isCategory
      ? api.get("/reels", { params: { category: value } }).then(({ data }) => data.items as Reel[])
      : isTraveler
        ? api.get("/search", { params: { tags: value } }).then(({ data }) => data.reels as Reel[])
        : Promise.resolve([]);
    void request.then((items) => {
      setReels(items);
      setLoaded(true);
    });
  }, [kind, value, isCategory, isTraveler]);

  const others = [
    ...REEL_CATEGORIES.map((c) => ({ to: `/tags/category/${c}`, label: t(`category.${c}`) })),
    ...TRAVELER_TAGS.map((tag) => ({ to: `/tags/traveler/${tag}`, label: t(`travelerTag.${tag}`) })),
  ].filter((o) => o.to !== `/tags/${kind}/${value}`);

  return (
    <div className="mx-auto w-full max-w-[935px] md:px-5 md:py-8">
      <header className="px-4 pb-4 pt-6 md:px-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-jz-ink">
          <span className="text-jz-red">#</span>
          {label.replace(/\s+/g, "") || "—"}
        </h1>
        {loaded && <p className="mt-1 text-sm text-gray-500">{t("tags.postCount", { count: reels.length })}</p>}
        <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {others.map((o) => (
            <Link key={o.to} to={o.to} className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
              <span className="text-jz-red">#</span>
              {o.label.replace(/\s+/g, "")}
            </Link>
          ))}
        </div>
      </header>

      {!loaded ? (
        <div className="grid grid-cols-3 gap-px md:gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      ) : reels.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-gray-500">{t("tags.empty")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-px md:gap-1">
          {reels.map((r) => (
            <ReelThumb key={r.id} reel={r} onOpen={(x) => setOpenId(x.id)} />
          ))}
        </div>
      )}

      {openId && (
        <ReelFullscreenViewer
          reels={reels}
          initialId={openId}
          onClose={() => setOpenId(null)}
          onToggleLike={actions.toggleLike}
          onToggleSave={actions.toggleSave}
          onToggleFollow={actions.toggleFollow}
          onCommentCountChange={actions.setCommentCount}
        />
      )}
    </div>
  );
}
