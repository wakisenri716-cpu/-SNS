import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { detectorCtor } from "../lib/qrScan";

// The back camera, full screen, reading QR codes with the browser's own
// BarcodeDetector (no library, nothing uploaded). Calls onCode once.
export default function QrScanner({ onCode, onClose }: { onCode: (value: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest callbacks, so a parent re-render doesn't restart the camera.
  const handlers = useRef({ onCode, onClose });
  handlers.current = { onCode, onClose };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let done = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (done || !video.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new (detectorCtor()!)({ formats: ["qr_code"] });
        const scan = async () => {
          if (done || !video.current) return;
          try {
            const [hit] = await detector.detect(video.current);
            if (hit?.rawValue) {
              done = true;
              navigator.vibrate?.(60);
              handlers.current.onCode(hit.rawValue);
              return;
            }
          } catch {
            // A frame that couldn't be read: try the next one.
          }
          timer = window.setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch {
        // A start cut short by closing (or React's dev double-run) isn't a camera problem.
        if (!done) setError(t("qrScan.noCamera"));
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handlers.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      done = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      window.removeEventListener("keydown", onKey);
    };
  }, [t]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("qrScan.title")} className="on-media fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <p className="flex-1 text-sm font-semibold">{t("qrScan.title")}</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <span className="relative h-60 w-60 rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" aria-hidden />
      </div>
      <p className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm" aria-live="polite">
        {error ?? t("qrScan.hint")}
      </p>
    </div>,
    document.body
  );
}
