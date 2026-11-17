import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, History, MapPinned, Mic, Search as SearchIcon } from "lucide-react";
import { clearRecentlyViewed, getRecentlyViewed, type RecentItem } from "../lib/recentlyViewed";
import Avatar from "../components/Avatar";
import ConciergeButton from "../components/ConciergeButton";
import { useSpeechInput } from "../lib/useSpeechInput";
import { api } from "../api/client";
import { TravelerTagPicker } from "../components/TravelerTagChips";
import type { Municipality, Reel, TravelerTag } from "../types";

interface RecommendItem {
  id: string;
  videoUrl: string;
  caption: string;
  municipality: { id: string; name: string; prefecture: string };
  likeCount: number;
  commentCount: number;
  score: number;
}

export default function SearchPage() {
  const { t, i18n } = useTranslation();
  // ?q= starts a search (e.g. text shared from another app, see SharePage).
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const speech = useSpeechInput(i18n.language, (text) => setQ(text));
  const [tags, setTags] = useState<TravelerTag[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [recommend, setRecommend] = useState<RecommendItem[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>(getRecentlyViewed);

  useEffect(() => {
    api.get("/search/recommend").then(({ data }) => setRecommend(data.items));
  }, []);

  const searching = q.trim() !== "" || tags.length > 0;

  useEffect(() => {
    if (!searching) {
      setMunicipalities([]);
      setReels([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get("/search", { params: { q, tags: tags.join(",") } }).then(({ data }) => {
        setMunicipalities(data.municipalities);
        setReels(data.reels);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, tags, searching]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-3 md:py-6">
      <h1 className="sr-only">{t("nav.search")}</h1>
      {/* Like Instagram's search: one plain grey field on top. */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={speech.listening ? t("concierge.listening") : t("search.placeholder")}
          aria-label={t("search.placeholder")}
          className="h-9 w-full rounded-lg bg-gray-100 pl-9 pr-10 text-sm text-gray-900 placeholder-gray-500 outline-none focus:ring-1 focus:ring-gray-300"
        />
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? t("concierge.stopVoice") : t("concierge.voice")}
            aria-pressed={speech.listening}
            className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition ${
              speech.listening ? "bg-jz-accent text-white" : "text-gray-500 hover:bg-gray-200"
            }`}
          >
            {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-jz-accent/40" />}
            <Mic className="relative h-4 w-4" />
          </button>
        )}
      </div>
      <ConciergeButton className="mt-2" />
      <Link to="/areas" className="mt-1 flex items-center gap-2 py-2 text-sm font-semibold text-jz-ink active:opacity-60">
        <MapPinned className="h-4 w-4" />
        <span className="flex-1">{t("areas.heading")}</span>
        <ChevronRight className="h-4 w-4 text-gray-500" />
      </Link>
      <div className="mt-1">
        <p className="mb-1.5 text-xs font-semibold text-gray-500">{t("search.tagFilterLabel")}</p>
        <TravelerTagPicker value={tags} onChange={setTags} />
      </div>

      {searching ? (
        <div className="mt-6 flex flex-col gap-6">
          {municipalities.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-gray-500">{t("search.municipalitiesHeading")}</h2>
              <ul>
                {municipalities.map((m) => (
                  <li key={m.id}>
                    <Link to={`/municipalities/${m.id}`} className="flex items-center gap-3 py-2 active:opacity-60">
                      <Avatar name={m.name} src={m.avatarUrl} size={44} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-jz-ink">
                          {m.name}
                          {m.listing && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-px text-px10 font-semibold text-gray-500">{t("listing.badge")}</span>}
                        </span>
                        <span className="block truncate text-px13 text-gray-500">{m.prefecture}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reels.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-gray-500">{t("search.postsHeading")}</h2>
              <div className="-mx-4 grid grid-cols-3 gap-[2px] md:mx-0">
                {reels.map((r) => (
                  <Link
                    key={r.id}
                    to={`/reels/${r.id}/access`}
                    state={{ reel: r }}
                    aria-label={`${r.locationName || r.caption.slice(0, 30)}・${r.municipality.name}`}
                    className="on-media block aspect-[3/4] overflow-hidden bg-gray-100 active:opacity-80"
                  >
                    <video src={`${r.videoUrl}#t=0.5`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {reels.length === 0 && tags.length > 0 && municipalities.length > 0 && (
            <p className="text-sm text-gray-500">{t("search.noTaggedPosts")}</p>
          )}
          {municipalities.length === 0 && reels.length === 0 && (
            <p className="text-sm text-gray-500">{t("search.noResults")}</p>
          )}
        </div>
      ) : (
        <>
        {recent.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <History className="h-3.5 w-3.5" /> {t("search.recentHeading")}
              </h2>
              <button
                type="button"
                onClick={() => {
                  clearRecentlyViewed();
                  setRecent([]);
                }}
                className="text-px11 font-semibold text-gray-500 hover:text-jz-ink"
              >
                {t("search.recentClear")}
              </button>
            </div>
            <div className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
              {recent.map((r) => (
                <Link key={r.id} to={`/reels/${r.id}/access`} className="w-28 shrink-0">
                  <span className="on-media block aspect-[4/5] overflow-hidden rounded-md bg-gray-100">
                    <video src={`${r.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold text-jz-ink">{r.place}</span>
                  <span className="block truncate text-px11 text-gray-500">{r.municipality}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold text-gray-500">{t("search.recommendHeading")}</h2>
          <div className="-mx-4 grid grid-cols-3 gap-[2px] md:mx-0">
            {recommend.map((r) => (
              <Link
                key={r.id}
                to={`/municipalities/${r.municipality.id}`}
                aria-label={r.municipality.name}
                className="on-media block aspect-[3/4] overflow-hidden bg-gray-100 active:opacity-80"
              >
                <video src={`${r.videoUrl}#t=0.5`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              </Link>
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
