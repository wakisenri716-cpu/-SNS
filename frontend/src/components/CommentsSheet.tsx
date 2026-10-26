import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Comment } from "../types";

type CommentRow = Comment & { canDelete: boolean };

// Comments on one reel, as a bottom sheet over the fullscreen viewer
// (GET/POST/DELETE /reels/:id/comments). Posting needs an account and the
// poster having comments enabled; authors and the managing municipality/
// company can delete.
export default function CommentsSheet({
  reelId,
  onClose,
  onCountChange,
}: {
  reelId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: CommentRow[]; commentsEnabled: boolean }>(`/reels/${reelId}/comments`)
      .then(({ data }) => {
        setItems(data.items);
        setEnabled(data.commentsEnabled);
      })
      .catch(() => setItems([]));
  }, [reelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update(next: CommentRow[]) {
    setItems(next);
    onCountChange(next.length);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !items) return;
    setSending(true);
    setError(null);
    try {
      const { data } = await api.post<CommentRow>(`/reels/${reelId}/comments`, { body: body.trim() });
      update([...items, data]);
      setBody("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("comments.error"));
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (!items || !window.confirm(t("comments.deleteConfirm"))) return;
    await api.delete(`/reels/${reelId}/comments/${id}`);
    update(items.filter((c) => c.id !== id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("comments.heading")}
        className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">
            💬 {t("comments.heading")}
            {items && <span className="ml-1 font-normal text-gray-400">{items.length}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("comments.close")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items == null ? (
            <p className="text-xs text-gray-400">…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">{t("comments.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">{c.user.name}</span>
                    <span className="text-[11px] text-gray-400">{new Date(c.createdAt).toLocaleDateString(i18n.language)}</span>
                    {c.canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="ml-auto text-[11px] text-gray-400 hover:text-red-500"
                      >
                        {t("comments.delete")}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-700">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          {!enabled ? (
            <p className="text-xs text-gray-400">{t("comments.disabled")}</p>
          ) : !user ? (
            <Link to="/login" className="text-xs font-semibold text-brand-600 hover:underline">
              {t("comments.loginCta")}
            </Link>
          ) : (
            <form onSubmit={send} className="flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={t("comments.placeholder")}
                className="min-w-0 flex-1 resize-none rounded-xl border border-gray-300 p-2 text-sm text-gray-900 outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={sending || !body.trim()}
                className="shrink-0 rounded-full bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {t("comments.submit")}
              </button>
            </form>
          )}
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
