import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { OPERATOR_INFO } from "../lib/operatorInfo";

// When this text was last changed (update it with the policy in the locales).
const UPDATED = "2026-11-03";

type Section = { heading: string; body?: string; items?: string[] };

export default function PrivacyPolicyPage() {
  const { t, i18n } = useTranslation();
  const sections = t("privacyPolicy.sections", { returnObjects: true }) as Section[];
  const [y, m, d] = UPDATED.split("-").map(Number);
  const updated = new Date(y, m - 1, d).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden border-gray-200 bg-white p-6 sm:my-6 sm:rounded-xl sm:border lg:max-w-3xl lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">{t("privacyPolicy.title")}</h1>
      <p className="mt-1 text-xs text-gray-500">{t("privacyPolicy.updated", { date: updated })}</p>
      {!OPERATOR_INFO.seller && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("privacyPolicy.draftNotice")}</p>}
      <p className="mt-4 text-sm leading-relaxed text-gray-700">{t("privacyPolicy.intro")}</p>

      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-gray-700">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="mb-1.5 font-semibold text-gray-900">{s.heading}</h2>
            {s.body && <p>{s.body}</p>}
            {s.items && (
              <ul className={`list-disc space-y-1 pl-5 ${s.body ? "mt-2" : ""}`}>
                {s.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section>
          <p>{t("privacyPolicy.operator", { name: OPERATOR_INFO.seller || t("privacyPolicy.unfilled") })}</p>
          <Link to="/contact" className="mt-1 inline-block font-semibold text-jz-accent hover:underline">
            {t("privacyPolicy.contactLink")}
          </Link>
        </section>
      </div>
    </div>
  );
}
