import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BedDouble, Check, Loader2 } from "lucide-react";
import { api } from "../api/client";

interface Candidate {
  id: number;
  name: string;
  access: string;
  minChargeYen: number | null;
}

// For a lodging post's editor: which 楽天トラベル hotel this post is, so
// travelers can book it from the post. Found automatically when the names
// match; here the poster can choose or change it.
export default function RakutenHotelLink({ reelId, current, onChange }: { reelId: string; current: { no: number; name: string } | null; onChange: (h: { no: number; name: string } | null) => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "off" | "error">("idle");

  async function load() {
    setState("loading");
    try {
      const { data } = await api.get<{ configured: boolean; hotels: Candidate[] }>(`/stays/candidates/${reelId}`);
      if (!data.configured) return setState("off");
      setList(data.hotels);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  async function pick(h: { no: number; name: string } | null) {
    const { data } = await api.put<{ rakutenHotel: { no: number; name: string } | null }>(`/stays/link/${reelId}`, { hotelNo: h?.no ?? null, name: h?.name ?? "" });
    onChange(data.rakutenHotel);
    setList(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
        <BedDouble className="h-4 w-4 text-jz-accent" /> {t("stays.linkHeading")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{current ? t("stays.linkedTo", { name: current.name }) : t("stays.linkNone")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-800 hover:bg-gray-200">
          {state === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
          {t(current ? "stays.linkChange" : "stays.linkChoose")}
        </button>
        {current && (
          <button type="button" onClick={() => void pick(null)} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-gray-500 ring-1 ring-gray-200">
            {t("stays.unlink")}
          </button>
        )}
      </div>
      {state === "off" && <p className="mt-2 text-[11px] text-gray-500">{t("stays.notConfigured")}</p>}
      {state === "error" && <p className="mt-2 text-[11px] text-jz-warm-text">{t("stays.error")}</p>}
      {list && (
        <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
          {list.length === 0 && <li className="p-3 text-[11px] text-gray-500">{t("stays.noCandidates")}</li>}
          {list.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => void pick({ no: h.id, name: h.name })} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-800">{h.name}</span>
                  {h.access && <span className="block truncate text-[10px] text-gray-500">{h.access}</span>}
                </span>
                {current?.no === h.id && <Check className="h-4 w-4 text-jz-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
