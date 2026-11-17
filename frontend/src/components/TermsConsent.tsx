import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// 利用規約・プライバシーポリシーへの同意: a required checkbox on the sign-up
// forms (the form can't be sent without it). The links open in a new tab so
// what's been typed stays.
export default function TermsConsent() {
  const { t } = useTranslation();
  // The sentence with markers where the two links go (word order differs by language).
  const sentence = t("terms.consent", { terms: "[[T]]", privacy: "[[P]]" });
  const [before, middle, after] = sentence.split(/\[\[[TP]\]\]/);
  const termsFirst = sentence.indexOf("[[T]]") < sentence.indexOf("[[P]]");
  const terms = (
    <Link to="/legal/terms" target="_blank" rel="noopener" className="font-semibold text-jz-ink underline">
      {t("terms.consentTerms")}
    </Link>
  );
  const privacy = (
    <Link to="/privacy-policy" target="_blank" rel="noopener" className="font-semibold text-jz-ink underline">
      {t("terms.consentPrivacy")}
    </Link>
  );
  return (
    <label className="flex items-start gap-2 text-xs leading-relaxed text-gray-600">
      <input type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-jz-accent)]" />
      <span>
        {before}
        {termsFirst ? terms : privacy}
        {middle}
        {termsFirst ? privacy : terms}
        {after}
      </span>
    </label>
  );
}
