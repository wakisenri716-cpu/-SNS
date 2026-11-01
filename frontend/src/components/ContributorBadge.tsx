import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";

// On a post made from a traveler's photo/video (素材の提供): who took it —
// their name if they asked to be credited, else just "a traveler".
export default function ContributorBadge({ name, className = "" }: { name: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur ${className}`}>
      <Camera className="h-3 w-3" />
      {name ? t("submissions.creditBadge", { name }) : t("submissions.creditAnonymous")}
    </span>
  );
}
