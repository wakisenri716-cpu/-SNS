import { useState } from "react";
import { useTranslation } from "react-i18next";

// Shares a link to a post's page: the phone's share sheet (LINE, X, ...)
// where the browser supports it, otherwise copies the link to the clipboard.
export default function ShareButton({
  path,
  title,
  variant = "light",
}: {
  path: string;
  title: string;
  variant?: "light" | "dark";
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

  return (
    <button
      type="button"
      onClick={share}
      aria-label={t("share.label")}
      className={
        variant === "dark"
          ? "flex items-center gap-1.5 text-white"
          : "flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      }
    >
      <span className={variant === "dark" ? "text-xl" : ""}>📤</span>
      {variant === "light" && <span>{copied ? t("share.copied") : t("share.label")}</span>}
      {variant === "dark" && copied && <span className="text-xs">{t("share.copied")}</span>}
    </button>
  );
}
