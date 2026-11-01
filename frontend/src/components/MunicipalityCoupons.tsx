import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ticket } from "lucide-react";
import { api } from "../api/client";
import type { Coupon } from "../types";

// The coupons this municipality and the businesses under it offer for
// points, on its page — a nudge, with the exchange on /points.
export default function MunicipalityCoupons({ municipalityId }: { municipalityId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Coupon[]>([]);
  useEffect(() => {
    api
      .get<{ items: Coupon[] }>("/coupons", { params: { municipalityId } })
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  }, [municipalityId]);
  if (items.length === 0) return null;
  return (
    <section className="mx-4 mt-4 md:mx-12" aria-label={t("coupons.onProfile")}>
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-jz-ink">
        <Ticket className="h-4 w-4 text-jz-accent" /> {t("coupons.onProfile")}
      </h2>
      <div className="scrollbar-none -mx-4 mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {items.slice(0, 10).map((c) => (
          <Link key={c.id} to="/points" className="w-52 shrink-0 rounded-2xl border border-dashed border-jz-accent/50 bg-jz-tint p-3 hover:bg-jz-tint/70">
            <p className="truncate text-[11px] text-gray-600">{c.issuer.name}</p>
            <p className="line-clamp-2 text-sm font-bold text-jz-ink">{c.title}</p>
            <p className="mt-1 text-xs font-black tabular-nums text-jz-accent">{t("myPage.pointsValue", { points: c.pointsCost })}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
