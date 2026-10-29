import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

// On Jaziba's own introductions of a municipality that hasn't joined (see
// backend Reel.editorial): says who wrote it and that the video is an
// illustration, so it's never mistaken for the town's own post.
export default function EditorialBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur ${className}`}>
      <Info className="h-3 w-3" />
      {t("editorial.badge")}
    </span>
  );
}
