import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { OPERATOR_INFO } from "../lib/operatorInfo";

// When this text was last changed (update it with the terms in the locales).
const UPDATED = "2026-11-17";

type Section = { heading: string; body?: string; items?: string[] };

// 利用規約: the conditions of use, agreed to at sign-up (TermsConsent).
export default function TermsPage() {
  const { t, i18n } = useTranslation();
  const sections = t("terms.sections", { returnObjects: true }) as Section[];
  const [y, m, d] = UPDATED.split("-").map(Number);
  const updated = new Date(y, m - 1, d).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden border-gray-200 bg-white p-6 sm:my-6 sm:rounded-xl sm:border lg:max-w-3xl lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">{t("terms.title")}</h1>
      <p className="mt-1 text-xs text-gray-500">{t("terms.updated", { date: updated })}</p>
      {!OPERATOR_INFO.seller && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("terms.draftNotice")}</p>}
      <p className="mt-4 text-sm leading-relaxed text-gray-700">{t("terms.intro")}</p>

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
          <p>{t("terms.operator", { name: OPERATOR_INFO.seller || t("terms.unfilled") })}</p>
          <div className="mt-1 flex flex-wrap gap-4">
            <Link to="/privacy-policy" className="font-semibold text-jz-accent hover:underline">
              {t("terms.privacyLink")}
            </Link>
            <Link to="/contact" className="font-semibold text-jz-accent hover:underline">
              {t("terms.contactLink")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
