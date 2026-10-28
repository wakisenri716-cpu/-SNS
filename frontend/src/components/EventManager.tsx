import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Trash2 } from "lucide-react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { formatEventDates } from "../lib/eventDates";
import type { EventItem } from "../types";

const empty = { title: "", startDate: "", endDate: "", locationName: "", url: "", description: "" };

// Dashboard: post events (festivals, markets, seasonal events) and remove
// them. They show on the home row and the profile's イベント tab until their
// end date has passed.
export default function EventManager() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<{ items: EventItem[] }>("/events/mine").then(({ data }) => setEvents(data.items));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/events", { ...form, endDate: form.endDate || form.startDate });
      setForm(empty);
      load();
    } catch (err) {
      setError(isAxiosError(err) && typeof err.response?.data?.error === "string" ? err.response.data.error : t("events.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(event: EventItem) {
    if (!window.confirm(t("events.confirmDelete", { title: event.title }))) return;
    await api.delete(`/events/${event.id}`);
    load();
  }

  const input = "w-full rounded-xl border border-gray-300 bg-white p-2.5 text-sm text-gray-900 outline-none focus:border-gray-400";
  const field = (key: keyof typeof empty) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
        <CalendarDays className="h-4 w-4" /> {t("events.manageHeading")}
      </h3>
      <p className="mt-1 text-xs text-gray-500">{t("events.manageNote")}</p>

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 lg:max-w-lg">
        <input {...field("title")} required maxLength={80} placeholder={t("events.titlePlaceholder")} className={input} />
        <div className="flex items-center gap-2">
          <label className="flex-1 text-xs text-gray-500">
            {t("events.start")}
            <input type="date" {...field("startDate")} required className={`${input} mt-1`} />
          </label>
          <label className="flex-1 text-xs text-gray-500">
            {t("events.end")}
            <input type="date" {...field("endDate")} min={form.startDate} className={`${input} mt-1`} />
          </label>
        </div>
        <input {...field("locationName")} maxLength={80} placeholder={t("events.placePlaceholder")} className={input} />
        <input {...field("url")} type="url" maxLength={500} placeholder={t("events.urlPlaceholder")} className={input} />
        <textarea {...field("description")} maxLength={1000} rows={3} placeholder={t("events.descriptionPlaceholder")} className={input} />
        {error && <p className="text-xs text-jz-red">{error}</p>}
        <button type="submit" disabled={saving} className="self-start rounded-full bg-jz-red px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
          {t("events.add")}
        </button>
      </form>

      {events.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 lg:max-w-lg">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{e.title}</p>
                <p className="truncate text-xs text-gray-500">{formatEventDates(e, i18n.language)}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(e)}
                aria-label={t("events.delete")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-jz-red"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
