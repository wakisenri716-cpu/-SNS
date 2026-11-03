import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BusFront, ExternalLink, FileText, Languages } from "lucide-react";
import { api } from "../api/client";
import { useTranslatable } from "../lib/useTranslatable";
import TranslateButtonLabel from "./TranslateButtonLabel";
import type { LocalTransit } from "../types";

// 地元の交通情報 for travelers: what the municipality and local businesses
// added from their own timetables and leaflets (community buses, on-demand
// taxis, shuttles). For one spot (its own first, then the town's), or a
// whole municipality. Shows nothing when there's none.
export default function LocalTransitList({ reelId, municipalityId, className = "" }: { reelId?: string; municipalityId?: string; className?: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<LocalTransit[]>([]);
  useEffect(() => {
    const q = reelId ? `reelId=${encodeURIComponent(reelId)}` : `municipalityId=${encodeURIComponent(municipalityId ?? "")}`;
    api
      .get<{ items: LocalTransit[] }>(`/local-transit?${q}`)
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  }, [reelId, municipalityId]);
  if (items.length === 0) return null;
  return (
    <section className={className} aria-labelledby="local-transit-heading">
      <h2 id="local-transit-heading" className="flex items-center gap-1.5 text-sm font-bold text-jz-ink">
        <BusFront className="h-4 w-4 text-jz-accent" /> {t("localTransit.heading")}
      </h2>
      <p className="mt-0.5 text-[11px] text-gray-500">{t("localTransit.sub")}</p>
      <ul className="mt-2 space-y-2.5">
        {items.map((item) => (
          <TransitCard key={item.id} item={item} showSpot={!reelId} />
        ))}
      </ul>
    </section>
  );
}

function TransitCard({ item, showSpot }: { item: LocalTransit; showSpot: boolean }) {
  const { t } = useTranslation();
  const text = item.body ? `${item.title}\n${item.body}` : item.title;
  const tr = useTranslatable(text, {
    source: "ja",
    fromServer: async (lang) => {
      const { data } = await api.post<{ title: string; body: string }>(`/local-transit/${item.id}/translation`, { lang });
      return data.body ? `${data.title}\n${data.body}` : data.title;
    },
  });
  const updated = new Date(item.updatedAt).toLocaleDateString();
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-3">
      {tr.showing ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{tr.text}</p>
      ) : (
        <>
          <p className="text-sm font-bold text-jz-ink">{item.title}</p>
          {item.body && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{item.body}</p>}
        </>
      )}
      {tr.available && (
        <button
          type="button"
          onClick={() => void tr.toggle()}
          disabled={tr.status === "loading"}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-jz-ink"
        >
          <Languages className="h-3 w-3" />
          <TranslateButtonLabel tr={tr} />
        </button>
      )}
      {item.fileKind === "image" && item.fileUrl && (
        <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-gray-100">
          <img src={item.fileUrl} alt={t("localTransit.imageAlt", { title: item.title })} loading="lazy" className="max-h-72 w-full bg-gray-50 object-contain" />
        </a>
      )}
      {item.fileKind === "pdf" && item.fileUrl && (
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-jz-ink hover:bg-gray-100"
        >
          <FileText className="h-4 w-4 shrink-0 text-jz-warm" />
          <span className="min-w-0 flex-1 truncate">{item.fileName || t("localTransit.pdf")}</span>
          <span className="shrink-0 text-jz-accent">{t("localTransit.openPdf")}</span>
        </a>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
        <span>{t("localTransit.by", { name: item.issuer.name })}</span>
        {showSpot && item.reel && <span>・{item.reel.locationName}</span>}
        {item.validUntil && <span>・{t("localTransit.until", { date: item.validUntil.replace(/-/g, "/") })}</span>}
        <span>・{t("localTransit.updated", { date: updated })}</span>
        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-jz-accent hover:underline">
            {t("localTransit.source")} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </p>
      {item.aiDrafted && <p className="mt-1 text-[10px] text-gray-400">{t("localTransit.aiDrafted")}</p>}
    </li>
  );
}
