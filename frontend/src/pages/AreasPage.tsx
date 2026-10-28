import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { api } from "../api/client";
import Avatar from "../components/Avatar";
import { REGIONS } from "../lib/regions";
import type { Municipality } from "../types";

// エリアから探す: every municipality on Jaziba by region → prefecture.
// Regions with no municipality yet are shown dimmed rather than hidden, so
// the map of where Jaziba is (and isn't yet) stays honest.
export default function AreasPage() {
  const { t } = useTranslation();
  const [municipalities, setMunicipalities] = useState<Municipality[] | null>(null);
  const [region, setRegion] = useState<string | null>(null);

  useEffect(() => {
    api.get<Municipality[]>("/municipalities").then(({ data }) => setMunicipalities(data));
  }, []);

  const byPrefecture = new Map<string, Municipality[]>();
  for (const m of municipalities ?? []) byPrefecture.set(m.prefecture, [...(byPrefecture.get(m.prefecture) ?? []), m]);
  const countIn = (prefs: readonly string[]) => prefs.reduce((n, p) => n + (byPrefecture.get(p)?.length ?? 0), 0);
  const shown = REGIONS.filter((r) => !region || r.key === region);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-jz-ink">
        {t("areas.heading")}
        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-jz-red align-baseline" aria-hidden />
      </h1>
      <p className="mt-1 text-sm text-gray-500">{t("areas.sub", { count: municipalities?.length ?? 0 })}</p>

      <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setRegion(null)}
          aria-pressed={!region}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${!region ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink"}`}
        >
          {t("areas.all")}
        </button>
        {REGIONS.map((r) => {
          const n = countIn(r.prefectures);
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRegion(r.key)}
              aria-pressed={region === r.key}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                region === r.key ? "bg-jz-ink text-white" : n > 0 ? "bg-gray-100 text-jz-ink" : "bg-gray-50 text-gray-500"
              }`}
            >
              {t(`areas.region.${r.key}`)}
              {n > 0 && <span className="ml-1 text-xs opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {municipalities == null ? (
        <div className="mt-6 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {shown.map((r) => (
            <section key={r.key}>
              <h2 className="text-sm font-bold text-jz-ink">{t(`areas.region.${r.key}`)}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {r.prefectures
                  .filter((p) => byPrefecture.has(p))
                  .map((p) => (
                    <div key={p}>
                      <p className="mb-1 text-xs font-semibold text-gray-500">{p}</p>
                      {byPrefecture.get(p)!.map((m) => (
                        <Link
                          key={m.id}
                          to={`/municipalities/${m.id}`}
                          className="mb-1.5 flex items-center gap-3 rounded-2xl border border-gray-200 p-3 transition hover:bg-gray-50"
                        >
                          <Avatar name={m.name} src={m.avatarUrl} size={40} ring />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-jz-ink">{m.name}</span>
                            <span className="block truncate text-xs text-gray-500">{m.description || p}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                        </Link>
                      ))}
                    </div>
                  ))}
                {countIn(r.prefectures) === 0 && <p className="text-xs text-gray-500">{t("areas.none")}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
