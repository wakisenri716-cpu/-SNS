import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { X } from "lucide-react";

const DISMISSED_KEY = "jaziba-welcome-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// One-line "what is this site" for logged-out first-time visitors, with the
// two sign-up paths (traveler / municipality). Closing it is remembered on
// this device only.
export default function WelcomeIntro() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (user || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable (private mode etc.): just hide it for this visit.
    }
  }

  return (
    <div className="relative mx-3 mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 pr-12 md:mx-0 md:mt-8">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcome.close")}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="relative max-w-[18rem] text-lg font-bold leading-snug tracking-tight text-jz-ink">{t("welcome.heading")}</p>
      <p className="relative mt-2 text-sm leading-relaxed text-gray-600">{t("welcome.body")}</p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Link to="/register" className="rounded-lg bg-jz-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-jz-accent-dark active:scale-95">
          {t("welcome.registerTraveler")}
        </Link>
        <Link
          to="/register-municipality"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-jz-ink ring-1 ring-gray-300 transition hover:bg-gray-50 active:scale-95"
        >
          {t("welcome.forMunicipality")}
        </Link>
      </div>
    </div>
  );
}
