import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onToast, type ToastMessage } from "../lib/toast";

// Glass pill that slides up above the tab bar for a few seconds.
export default function Toaster() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => onToast(setToast), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="glass-dark animate-toast-in fixed bottom-28 left-1/2 z-[70] flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-full px-5 py-3 text-sm text-white md:bottom-8"
    >
      <span className="font-medium">{toast.text}</span>
      {toast.action && (
        <Link to={toast.action.to} onClick={() => setToast(null)} className="shrink-0 font-semibold text-[#ff8f97]">
          {toast.action.label}
        </Link>
      )}
    </div>
  );
}
