import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface LiveItem {
  id: string;
  place: string;
  videoUrl: string;
  viewers: number;
}

// LIVE for municipalities/companies: how many people are looking at their
// posts right now, and which ones (GET /reels/mine/live), every 10 seconds
// while the page is visible.
export default function PosterLiveCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ total: number; items: LiveItem[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      api
        .get<{ total: number; items: LiveItem[] }>("/reels/mine/live")
        .then(({ data }) => alive && setData(data))
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 10_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  if (!data) return null;
  return (
    <section className="on-media mx-3 mt-3 rounded-3xl bg-jz-ink p-4 text-white lg:mx-4" aria-live="polite" aria-label={t("posterLive.label")}>
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.2em] text-white/80">
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full bg-jz-red opacity-75 motion-reduce:hidden ${data.total > 0 ? "animate-ping" : ""}`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${data.total > 0 ? "bg-jz-red" : "bg-white/40"}`} />
        </span>
        LIVE
      </p>
      <p className="mt-1 text-lg font-extrabold">
        {data.total > 0 ? t("posterLive.now", { count: data.total }) : t("posterLive.none")}
      </p>
      {data.items.length > 0 && (
        <ul className="scrollbar-none -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4">
          {data.items.slice(0, 8).map((item) => (
            <li key={item.id} className="w-24 shrink-0">
              <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-white/10">
                <video src={`${item.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-jz-red px-1.5 py-0.5 text-[10px] font-bold">👀 {item.viewers}</span>
              </span>
              <span className="mt-1 block truncate text-[11px] text-white/80">{item.place}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-white/50">{t("posterLive.note")}</p>
    </section>
  );
}
