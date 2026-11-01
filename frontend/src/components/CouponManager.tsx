import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Plus, ScanLine, Ticket } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";
import type { Coupon, CouponRedemption } from "../types";

const empty = { title: "", description: "", terms: "", pointsCost: "100", stock: "", perUserLimit: "1", validUntil: "" };

// クーポン, for a municipality or a business: coupons travelers exchange
// their points for, how many were exchanged and used, and the counter check —
// type (or scan) the code a traveler shows and mark it used.
export default function CouponManager() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Coupon[] | null>(null);
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<CouponRedemption | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const load = () =>
    api
      .get<{ items: Coupon[] }>("/coupons/issued")
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/coupons", {
        title: form.title,
        description: form.description,
        terms: form.terms,
        pointsCost: Number(form.pointsCost),
        stock: form.stock ? Number(form.stock) : null,
        perUserLimit: Number(form.perUserLimit),
        validUntil: form.validUntil || null,
      });
      setForm(empty);
      setCreating(false);
      showToast(t("coupons.created"));
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("points.error"));
    }
  }

  async function toggle(c: Coupon) {
    await api.patch(`/coupons/${c.id}`, { active: !c.active });
    void load();
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setFound(null);
    setLookupError(null);
    try {
      const { data } = await api.get<CouponRedemption>(`/coupons/verify/${encodeURIComponent(code.trim())}`);
      setFound(data);
    } catch (err: any) {
      setLookupError(err?.response?.data?.error ?? t("points.error"));
    }
  }

  async function markUsed() {
    if (!found) return;
    try {
      const { data } = await api.post<{ usedAt: string }>(`/coupons/verify/${encodeURIComponent(found.code)}/use`);
      setFound({ ...found, usedAt: data.usedAt });
      navigator.vibrate?.(80);
      void load();
    } catch (err: any) {
      setLookupError(err?.response?.data?.error ?? t("points.error"));
    }
  }

  const field = "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  const label = "block text-xs font-medium text-gray-500";
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-4 p-3 lg:p-4">
      <p className="rounded-2xl bg-jz-tint px-4 py-3 text-xs leading-relaxed text-jz-ink">{t("coupons.intro")}</p>

      <form onSubmit={lookup} className="rounded-2xl border border-gray-200 p-3" aria-label={t("coupons.checkHeading")}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <ScanLine className="h-4 w-4 text-jz-accent" /> {t("coupons.checkHeading")}
        </p>
        <div className="mt-2 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" aria-label={t("coupons.codeLabel")} className={`${field} mt-0 font-mono uppercase tracking-widest`} />
          <button type="submit" disabled={!code.trim()} className="shrink-0 rounded-full bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-40">
            {t("coupons.lookup")}
          </button>
        </div>
        {lookupError && <p className="mt-2 text-xs text-jz-warm-text">{lookupError}</p>}
        {found && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs" aria-live="polite">
            <p className="font-bold text-gray-900">{found.coupon.title}</p>
            <p className="mt-0.5 text-gray-600">{t("coupons.holder", { name: found.holder })}</p>
            {found.usedAt ? (
              <p className="mt-2 flex items-center gap-1 font-bold text-gray-600">
                <CheckCircle2 className="h-4 w-4 text-jz-accent" /> {t("coupons.alreadyUsed", { time: new Date(found.usedAt).toLocaleString() })}
              </p>
            ) : found.expired ? (
              <p className="mt-2 font-bold text-jz-warm-text">{t("points.expired")}</p>
            ) : (
              <button type="button" onClick={() => void markUsed()} className="mt-2 rounded-full bg-jz-accent px-4 py-2 text-xs font-bold text-white">
                {t("coupons.markUsed")}
              </button>
            )}
          </div>
        )}
      </form>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Ticket className="h-4 w-4 text-jz-accent" /> {t("coupons.listHeading")}
        </p>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-full bg-jz-accent px-3 py-1.5 text-xs font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> {t("coupons.new")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border border-gray-200 p-3">
          <label className={label}>
            {t("coupons.titleLabel")}
            <input required value={form.title} onChange={set("title")} maxLength={60} placeholder={t("coupons.titlePlaceholder")} className={field} />
          </label>
          <label className={label}>
            {t("coupons.descriptionLabel")}
            <textarea value={form.description} onChange={set("description")} maxLength={300} rows={2} className={field} />
          </label>
          <label className={label}>
            {t("coupons.termsLabel")}
            <textarea value={form.terms} onChange={set("terms")} maxLength={300} rows={2} placeholder={t("coupons.termsPlaceholder")} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("coupons.costLabel")}
              <input required type="number" min={10} max={100000} value={form.pointsCost} onChange={set("pointsCost")} className={field} />
            </label>
            <label className={label}>
              {t("coupons.stockLabel")}
              <input type="number" min={1} value={form.stock} onChange={set("stock")} placeholder={t("coupons.noLimit")} className={field} />
            </label>
            <label className={label}>
              {t("coupons.perUserLabel")}
              <input type="number" min={1} max={10} value={form.perUserLimit} onChange={set("perUserLimit")} className={field} />
            </label>
            <label className={label}>
              {t("coupons.validUntilLabel")}
              <input type="date" value={form.validUntil} onChange={set("validUntil")} className={field} />
            </label>
          </div>
          {error && <p className="text-xs text-jz-warm-text">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {t("dashboard.cancel")}
            </button>
            <button type="submit" className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white">
              {t("coupons.publish")}
            </button>
          </div>
        </form>
      )}

      {items == null ? (
        <div className="skeleton h-24 rounded-2xl" />
      ) : items.length === 0 ? (
        !creating && <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">{t("coupons.none")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className={`flex items-start gap-3 rounded-2xl border p-3 ${c.open ? "border-gray-200" : "border-gray-100 bg-gray-50"}`}>
              <div className="min-w-0 flex-1 text-xs">
                <p className="text-sm font-bold text-gray-900">
                  {c.title}
                  {!c.open && <span className="ml-1.5 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{c.active ? t("coupons.ended") : t("coupons.stopped")}</span>}
                </p>
                <p className="mt-0.5 text-gray-600">
                  {[
                    t("myPage.pointsValue", { points: c.pointsCost }),
                    t("coupons.stats", { exchanged: c.exchanged ?? 0, used: c.used ?? 0 }),
                    c.remaining != null && t("points.remaining", { count: c.remaining }),
                    c.validUntil && t("points.validUntil", { date: c.validUntil.replace(/-/g, "/") }),
                  ]
                    .filter(Boolean)
                    .join("・")}
                </p>
              </div>
              <button type="button" onClick={() => void toggle(c)} className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-200">
                {c.active ? t("coupons.stop") : t("coupons.restart")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
