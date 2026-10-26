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
    <div className="relative mx-4 mt-4 rounded-xl border border-gray-200 bg-white p-5 pr-12 text-gray-900 md:mt-8">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcome.close")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-base font-semibold leading-snug">{t("welcome.heading")}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{t("welcome.body")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/register" className="rounded-lg bg-[#0095f6] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1877f2]">
          {t("welcome.registerTraveler")}
        </Link>
        <Link
          to="/register-municipality"
          className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        >
          {t("welcome.forMunicipality")}
        </Link>
      </div>
    </div>
  );
}
