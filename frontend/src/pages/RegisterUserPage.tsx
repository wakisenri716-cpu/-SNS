import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { NATIONALITIES } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

export default function RegisterUserPage() {
  const { registerUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [nationality, setNationality] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerUser(form.email, form.password, form.name, {
        nationality: nationality || undefined,
        birthYear: birthYear ? Number(birthYear) : undefined,
      });
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("registerUser.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm my-12">
      <h1 className="mb-6 text-center text-xl font-bold text-gray-900">{t("registerUser.title")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required
          placeholder={t("registerUser.namePlaceholder")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
        <input
          type="email"
          required
          placeholder={t("registerUser.emailPlaceholder")}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("registerUser.passwordPlaceholder")}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-400">{t("registerUser.demographicsNote")}</p>
        <label className="text-xs font-medium text-gray-500">
          {t("registerUser.nationalityLabel")}
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className={`mt-1 block w-full ${inputClass}`}
          >
            <option value="">{t("registerUser.nationalityPlaceholder")}</option>
            {NATIONALITIES.map((n) => (
              <option key={n} value={n}>
                {t(`nationality.${n}`)}
              </option>
            ))}
          </select>
        </label>
        <input
          type="number"
          placeholder={t("registerUser.birthYearPlaceholder")}
          min={1900}
          max={new Date().getFullYear()}
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className={inputClass}
        />
        {error && (
          <p className="text-sm text-red-500">
            {typeof error === "string" ? error : t("registerUser.invalidInput")}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-teal-600 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {t("registerUser.submit")}
        </button>
      </form>
    </div>
  );
}
