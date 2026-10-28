import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Share2 } from "lucide-react";
import { shareLink } from "../lib/shareLink";

// Shares a link to a post's page (see lib/shareLink).
export default function ShareButton({
  path,
  title,
  variant = "light",
}: {
  path: string;
  title: string;
  variant?: "light" | "rail" | "icon";
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;

  async function share() {
    const result = await shareLink(url, title);
    if (result === "copied") {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else if (result === "manual") {
      window.prompt(t("share.copyManually"), url);
    }
  }

  if (variant === "icon") {
    return (
      <button type="button" onClick={share} aria-label={copied ? t("share.copied") : t("share.label")} className="relative">
        <Send className="h-[26px] w-[26px] text-gray-900 hover:text-gray-500" strokeWidth={1.8} />
        {copied && (
          <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white">
            {t("share.copied")}
          </span>
        )}
      </button>
    );
  }

  if (variant === "rail") {
    return (
      <button type="button" onClick={share} aria-label={t("share.label")} className="flex flex-col items-center gap-1 text-white">
        <span className="flex h-9 w-9 items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition active:scale-90">
          <Send className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <span className="text-xs font-semibold drop-shadow">{copied ? t("share.copiedShort") : t("share.label")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={t("share.label")}
      className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
    >
      <Share2 className="h-3.5 w-3.5" />
      <span>{copied ? t("share.copied") : t("share.label")}</span>
    </button>
  );
}
