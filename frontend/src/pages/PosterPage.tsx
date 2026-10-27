import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import JazibaLogo from "../components/JazibaLogo";

// Printable A4 poster with a QR code to the municipality's Jaziba page, for
// stations, tourist information desks and shop counters. Lives outside the
// app layout so only the poster prints.
export default function PosterPage() {
  const { t } = useTranslation();
  const { municipality } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const url = municipality ? `${window.location.origin}/municipalities/${municipality.id}` : "";

  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M", color: { dark: "#11151d", light: "#ffffff" } }).then(setQr);
  }, [url]);

  if (!municipality) {
    return (
      <p className="p-10 text-center text-sm text-gray-500">
        <Link to="/login" className="font-semibold underline">
          {t("poster.loginRequired")}
        </Link>
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link to="/dashboard" className="text-sm font-semibold text-gray-600 hover:underline">
          {t("poster.back")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-jz-red px-5 py-2.5 text-sm font-bold text-white"
        >
          <Printer className="h-4 w-4" /> {t("poster.print")}
        </button>
      </div>

      {/* A4 sheet; light colors are forced so it prints the same in dark mode. */}
      <article
        className="poster-sheet relative mx-auto flex aspect-[210/297] w-full max-w-[210mm] flex-col items-center overflow-hidden bg-white px-[8%] py-[7%] text-center text-[#11151d] shadow-xl print:shadow-none"
        style={{ colorScheme: "light" }}
      >
        <span className="absolute -right-[18%] -top-[12%] aspect-square w-[60%] rounded-full bg-[#d7202e]" aria-hidden />
        <JazibaLogo className="relative h-[6%] w-auto self-start" />
        <p className="relative mt-[10%] text-[clamp(14px,2.6vw,22px)] font-bold">{t("poster.lead")}</p>
        <h1 className="relative mt-[2%] text-[clamp(32px,7vw,64px)] font-extrabold leading-tight tracking-tight">{municipality.name}</h1>
        <p className="relative mt-[2%] text-[clamp(12px,2vw,17px)] text-[#4a5565]">{t("poster.sub")}</p>
        {qr ? (
          <img src={qr} alt={url} className="relative mt-[7%] aspect-square w-[46%] rounded-2xl border-[6px] border-[#11151d] p-[2%]" />
        ) : (
          <div className="relative mt-[7%] aspect-square w-[46%] rounded-2xl bg-gray-100" />
        )}
        <p className="relative mt-[4%] text-[clamp(12px,2vw,18px)] font-bold">{t("poster.scan")}</p>
        <p className="relative mt-[1.5%] text-[clamp(10px,1.5vw,13px)] text-[#4a5565]">Scan to watch · 扫码观看 · 스캔해서 보기</p>
        <p className="relative mt-auto break-all text-[clamp(9px,1.3vw,12px)] text-[#6a7282]">{url}</p>
      </article>
    </div>
  );
}
