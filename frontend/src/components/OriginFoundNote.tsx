import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";

export type OriginFound = { label: string; kind: "google" | "station" | "town" | "municipality" | "prefecture" } | null | undefined;

// What a typed starting point was taken as ("松本駅（長野県）として計算"),
// or that it couldn't be found — so a rough answer never looks exact.
export default function OriginFoundNote({ found, className = "" }: { found: OriginFound; className?: string }) {
  const { t } = useTranslation();
  if (found === undefined) return null;
  return (
    <p className={`flex items-start gap-1 text-[11px] leading-relaxed ${found ? "text-gray-500" : "text-amber-700"} ${className}`}>
      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {found ? t("origin.foundAs", { label: found.label, where: t(`origin.kind.${found.kind}`) }) : t("origin.notFound")}
        {found && found.kind !== "google" && <span className="block text-[10px] text-gray-400">{t(`origin.credit.${found.kind}`)}</span>}
      </span>
    </p>
  );
}
