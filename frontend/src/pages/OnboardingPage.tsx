import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import JazibaLogo from "../components/JazibaLogo";
import { REEL_CATEGORIES, TRAVEL_COMPANIONS, type AuthUser } from "../types";

// Right after a traveler registers: three quick taps to set their travel
// style, which orders the おすすめ feed (same fields as 設定 › 旅行スタイル).
// Everything is optional — "あとで" skips straight to the feed.
export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [companion, setCompanion] = useState<AuthUser["travelCompanion"]>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [barrierFree, setBarrierFree] = useState(false);
  const [multilingual, setMultilingual] = useState(false);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      const { data } = await api.put("/auth/me", {
        travelCompanion: companion,
        favoriteCategories: categories,
        needsBarrierFree: barrierFree,
        needsMultilingual: multilingual,
      });
      updateUser(data);
    } finally {
      navigate("/", { replace: true });
    }
  }

  const chip = (selected: boolean) =>
    `flex items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold transition active:scale-[0.98] ${
      selected ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink hover:bg-gray-200"
    }`;

  const steps = [
    {
      title: t("onboarding.companionTitle"),
      body: (
        <div className="grid grid-cols-2 gap-2.5">
          {TRAVEL_COMPANIONS.map((c) => (
            <button key={c} type="button" onClick={() => setCompanion(companion === c ? null : c)} className={chip(companion === c)} aria-pressed={companion === c}>
              {t(`settings.companion.${c}`)}
              {companion === c && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: t("onboarding.categoriesTitle"),
      body: (
        <div className="grid grid-cols-2 gap-2.5">
          {REEL_CATEGORIES.map((c) => {
            const on = categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategories(on ? categories.filter((x) => x !== c) : [...categories, c])}
                className={chip(on)}
                aria-pressed={on}
              >
                {t(`category.${c}`)}
                {on && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: t("onboarding.needsTitle"),
      body: (
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => setBarrierFree(!barrierFree)} className={chip(barrierFree)} aria-pressed={barrierFree}>
            {t("settings.needsBarrierFreeLabel")}
            {barrierFree && <Check className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setMultilingual(!multilingual)} className={chip(multilingual)} aria-pressed={multilingual}>
            {t("settings.needsMultilingualLabel")}
            {multilingual && <Check className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <div className="flex items-center justify-between">
        <JazibaLogo className="h-8 w-auto" />
        <button type="button" onClick={() => navigate("/", { replace: true })} className="text-sm font-semibold text-gray-500">
          {t("onboarding.later")}
        </button>
      </div>
      <div className="mt-8 flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-jz-red" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="mt-6 text-xs font-semibold text-jz-red">{t("onboarding.stepOf", { step: step + 1, total: steps.length })}</p>
      <div key={step} className="animate-page-in">
        <h1 className="mt-1 text-2xl font-extrabold leading-snug tracking-tight text-jz-ink">{steps[step].title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{t("onboarding.why")}</p>
        <div className="mt-6">{steps[step].body}</div>
      </div>
      <div className="mt-auto flex gap-2 pt-8">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="flex-1 rounded-full bg-gray-100 py-3.5 text-sm font-semibold text-jz-ink">
            {t("onboarding.back")}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => (last ? void finish() : setStep(step + 1))}
          className="flex-[2] rounded-full bg-jz-red py-3.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {last ? t("onboarding.start") : t("onboarding.next")}
        </button>
      </div>
    </div>
  );
}
