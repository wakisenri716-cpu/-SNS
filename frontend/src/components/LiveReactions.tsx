import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { api } from "../api/client";
import { tabId, useLiveViewers } from "../lib/useLiveViewers";
import { haptic } from "../lib/haptics";

const REACTIONS = [
  { key: "heart", emoji: "❤️" },
  { key: "wow", emoji: "😍" },
  { key: "clap", emoji: "👏" },
  { key: "fire", emoji: "🔥" },
] as const;
const EMOJI: Record<string, string> = Object.fromEntries(REACTIONS.map((r) => [r.key, r.emoji]));

interface Floater {
  id: number;
  emoji: string;
  x: number;
  mine: boolean;
}

// ライブ: on the reel being watched, how many people are watching it right now
// and reactions that float up on everyone's screen at once (GET /reels/:id/live
// + POST /reels/:id/react). Reactions aren't stored anywhere.
export default function LiveReactions({ reelId }: { reelId: string }) {
  const { t } = useTranslation();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(1);

  function float(reaction: string, mine: boolean) {
    const emoji = EMOJI[reaction];
    if (!emoji) return;
    const id = nextId.current++;
    // Cap what's on screen so a burst of reactions stays light.
    setFloaters((prev) => [...prev.slice(-24), { id, emoji, x: Math.random() * 56, mine }]);
    window.setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 2600);
  }

  const viewers = useLiveViewers(reelId, (reaction) => float(reaction, false));
  useEffect(() => setFloaters([]), [reelId]);

  function send(reaction: string) {
    haptic();
    float(reaction, true);
    void api.post(`/reels/${reelId}/react`, { reaction, client: tabId() }).catch(() => {});
  }

  return (
    <>
      {viewers != null && viewers >= 2 && (
        <span className="glass-dark animate-fade-in pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jz-red opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-jz-red" />
          </span>
          <Eye className="h-3 w-3" /> {t("live.watching", { count: viewers })}
        </span>
      )}
      <div className="pointer-events-none absolute bottom-24 right-14 z-10 h-[55%] w-20 overflow-hidden" aria-hidden>
        {floaters.map((f) => (
          <span key={f.id} className={`live-float absolute bottom-0 ${f.mine ? "text-3xl" : "text-2xl"}`} style={{ left: f.x }}>
            {f.emoji}
          </span>
        ))}
      </div>
      <div className="absolute left-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+2.25rem)] z-20 flex gap-1.5" role="group" aria-label={t("live.reactLabel")}>
        {REACTIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => send(r.key)}
            aria-label={t(`live.reaction.${r.key}`)}
            className="glass-dark flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-75"
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </>
  );
}
