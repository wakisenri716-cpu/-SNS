import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AUTH_NOTICE_KEY, useAuth } from "../auth/AuthContext";

const inputClass =
  "rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice] = useState(() => {
    const stored = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (stored) sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return stored;
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("login.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-4 my-8 rounded-xl border border-gray-200/80 bg-white p-7 sm:mx-auto sm:my-12 sm:max-w-sm sm:p-8">
      <h1 className="mb-6 text-center text-xl font-bold text-gray-900">{t("login.title")}</h1>
      {notice && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder={t("login.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          placeholder={t("login.passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-jz-red">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gray-900 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t("login.submit")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        {t("login.touristPrompt")}
        <Link to="/register" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.touristLink")}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        {t("login.municipalityPrompt")}
        <Link to="/register-municipality" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.municipalityLink")}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        {t("login.companyPrompt")}
        <Link to="/register-company" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.companyLink")}
        </Link>
      </p>
    </div>
  );
}
