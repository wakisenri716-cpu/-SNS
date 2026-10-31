import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Copy, Download, Nfc, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";

type NdefWriter = { write: (message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }) => Promise<void> };
const ndefSupported = () => typeof window !== "undefined" && "NDEFReader" in window;

// 現地スタンプのタグ, for whoever manages the post: a secret link for this
// spot to put on an NFC tag (written right here with Web NFC on Android
// Chrome, or with any NFC app) or print as a QR code. A traveler who reads
// it on site gets the stamp without GPS. Making a new one stops the old
// tags and QR codes working.
export default function CheckinTagSection({ reelId, placeName }: { reelId: string; placeName: string }) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState<"idle" | "waiting" | "done" | "failed">("idle");
  const abort = useRef<AbortController | null>(null);
  const url = token ? `${window.location.origin}/c/${token}` : "";

  useEffect(() => {
    api
      .get<{ token: string | null }>(`/reels/${reelId}/checkin-tag`)
      .then(({ data }) => setToken(data.token))
      .catch(() => setToken(null));
    return () => abort.current?.abort();
  }, [reelId]);

  useEffect(() => {
    if (!url) return setQr(null);
    void QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M", color: { dark: "#11151d", light: "#ffffff" } }).then(setQr);
  }, [url]);

  async function make() {
    if (token && !window.confirm(t("checkinTag.remakeConfirm"))) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ token: string }>(`/reels/${reelId}/checkin-tag`);
      setToken(data.token);
      setWriting("idle");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("checkinTag.removeConfirm"))) return;
    setBusy(true);
    try {
      await api.delete(`/reels/${reelId}/checkin-tag`);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function writeTag() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    setWriting("waiting");
    try {
      const writer = new (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader();
      await writer.write({ records: [{ recordType: "url", data: url }] }, { signal: controller.signal });
      navigator.vibrate?.(80);
      setWriting("done");
    } catch {
      setWriting("failed");
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("checkinTag.copied"));
    } catch {
      showToast(url);
    }
  }

  if (token === undefined) return <div className="skeleton h-16 rounded-xl" />;
  const button = "inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-900 hover:bg-gray-200 disabled:opacity-50";
  return (
    <section className="rounded-xl border border-gray-200 p-3 text-xs text-gray-600" aria-label={t("checkinTag.heading")}>
      <p className="flex items-center gap-1.5 font-bold text-gray-900">
        <Nfc className="h-4 w-4 text-jz-red" /> {t("checkinTag.heading")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{t("checkinTag.intro")}</p>
      {!token ? (
        <button type="button" disabled={busy} onClick={() => void make()} className="mt-2 rounded-full bg-gray-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
          {t("checkinTag.make")}
        </button>
      ) : (
        <>
          <div className="mt-2 flex gap-3">
            {qr && <img src={qr} alt={t("checkinTag.qrAlt", { name: placeName })} className="h-28 w-28 shrink-0 rounded-lg border border-gray-200" />}
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="break-all rounded-lg bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-700">{url}</p>
              <div className="flex flex-wrap gap-1.5">
                {ndefSupported() && (
                  <button type="button" onClick={() => void writeTag()} disabled={writing === "waiting"} className={`${button} bg-jz-red text-white hover:bg-jz-red-dark`}>
                    <Nfc className="h-3.5 w-3.5" /> {t("checkinTag.write")}
                  </button>
                )}
                {qr && (
                  <a href={qr} download={`jaziba-stamp-${placeName.slice(0, 20) || reelId}.png`} className={button}>
                    <Download className="h-3.5 w-3.5" /> {t("checkinTag.downloadQr")}
                  </a>
                )}
                <button type="button" onClick={() => void copy()} className={button}>
                  <Copy className="h-3.5 w-3.5" /> {t("checkinTag.copy")}
                </button>
              </div>
            </div>
          </div>
          {writing !== "idle" && (
            <p className={`mt-2 text-[11px] font-semibold ${writing === "failed" ? "text-jz-red" : writing === "done" ? "text-emerald-700" : "text-gray-700"}`} aria-live="polite">
              {t(`checkinTag.writing.${writing}`)}
            </p>
          )}
          {!ndefSupported() && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{t("checkinTag.noWebNfc")}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" disabled={busy} onClick={() => void make()} className={button}>
              <RefreshCw className="h-3.5 w-3.5" /> {t("checkinTag.remake")}
            </button>
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${button} text-gray-500`}>
              <Trash2 className="h-3.5 w-3.5" /> {t("checkinTag.remove")}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{t("checkinTag.note")}</p>
        </>
      )}
    </section>
  );
}
