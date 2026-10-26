import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";

// Shares a link to a post's page: the phone's share sheet (LINE, X, ...)
// where the browser supports it, otherwise copies the link to the clipboard.
export default function ShareButton({
  path,
  title,
  variant = "light",
}: {
  path: string;
  title: string;
  variant?: "light" | "rail";
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // The user closing the share sheet isn't an error worth reacting to.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("share.copyManually"), url);
    }
  }

  if (variant === "rail") {
    return (
      <button type="button" onClick={share} aria-label={t("share.label")} className="flex flex-col items-center gap-1 text-white">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition active:scale-90">
          <Share2 className="h-6 w-6" />
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
