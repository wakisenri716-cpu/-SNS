import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

const inputClass =
  "rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

const CONTACT_EMAIL = "wakisenri726@gmail.com";

export default function ContactPage() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/inquiries", { name, email, message });
      setSuccess(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("contact.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-4 my-6 rounded-xl border border-gray-200/80 bg-white p-7 sm:mx-auto sm:w-full sm:max-w-sm sm:p-8 lg:max-w-md">
      <h1 className="mb-2 text-center text-xl font-bold text-gray-900">{t("contact.title")}</h1>
      <p className="mb-6 text-center text-sm text-gray-500">{t("contact.description")}</p>

      {success ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-3 text-center text-sm text-emerald-700">{t("contact.success")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder={t("contact.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <input
            type="email"
            required
            placeholder={t("contact.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <textarea
            required
            rows={5}
            placeholder={t("contact.messagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-jz-red">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gray-900 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {t("contact.submit")}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-xs text-gray-500">
        {t("contact.directEmailNote")}
        <br />
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-gray-900 hover:underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
