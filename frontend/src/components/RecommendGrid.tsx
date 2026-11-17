import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { GRID_LAYOUT, GridRotation, swapOrder, type Cell, type Pools, type Tier } from "../lib/gridRotation";
import type { Reel } from "../types";

// How often one square changes (each square changes about every 9 × this).
const SWAP_MS = 2600;
// A new post that won't load in time is shown anyway.
const LOAD_TIMEOUT_MS = 4000;

const TIER_CHIP: Record<Tier, string> = {
  famous: "bg-jz-warm text-white",
  middle: "bg-jz-accent text-white",
  hidden: "bg-white/90 text-jz-ink",
};

// おすすめ 9マス: nine posts on one screen — 2 定番, 3 注目 and 4 穴場 towns —
// one square at a time changing to another post from the same pool. Pauses
// with the button, off screen, in a background tab, while a post is open,
// and starts paused with reduced motion. Without tiers (saved, following,
// nearby) it rotates through the list as it comes.
export default function RecommendGrid({
  pools,
  tiered,
  active,
  onOpen,
}: {
  pools: Pools<Reel>;
  tiered: boolean;
  /** False while a post is open over the grid. */
  active: boolean;
  /** The post tapped, and the nine on screen (for swiping in the viewer). */
  onOpen: (reel: Reel, onScreen: Reel[]) => void;
}) {
  const { t } = useTranslation();
  const rotation = useMemo(() => new GridRotation(pools), [pools]);
  // The nine on screen, started over when the pools change (tab change, refresh).
  const [state, setState] = useState(() => ({ rotation, cells: rotation.fill() }));
  if (state.rotation !== rotation) setState({ rotation, cells: rotation.fill() });
  const cells = state.cells;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [paused, setPaused] = useState(!!reducedMotion);
  const [visible, setVisible] = useState(true);
  const [pageShown, setPageShown] = useState(() => typeof document === "undefined" || !document.hidden);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onChange = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const running = !paused && visible && pageShown && active && rotation.size > GRID_LAYOUT.length;
  useEffect(() => {
    if (!running) return;
    let order = swapOrder(GRID_LAYOUT.length);
    let step = 0;
    const timer = setInterval(() => {
      if (step >= order.length) {
        order = swapOrder(GRID_LAYOUT.length);
        step = 0;
      }
      const index = order[step++];
      setState((prev) => {
        if (prev.rotation !== rotation) return prev;
        const onScreen = new Set(prev.cells.flatMap((c) => (c ? [c.item.id] : [])));
        const next = rotation.take(GRID_LAYOUT[index], onScreen);
        if (!next) return prev;
        const copy = [...prev.cells];
        copy[index] = next;
        return { rotation, cells: copy };
      });
    }, SWAP_MS);
    return () => clearInterval(timer);
  }, [running, rotation]);

  const shown = cells.flatMap((c) => (c ? [c.item] : []));
  return (
    <section ref={rootRef} aria-label={t("grid.label")} className="px-1 pt-2 md:px-0">
      <div className="flex items-center gap-2 px-2 pb-1.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-gray-500">{tiered ? t("grid.note") : t("grid.notePlain")}</p>
        {rotation.size > GRID_LAYOUT.length && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={t(paused ? "grid.resume" : "grid.pause")}
            className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {t(paused ? "grid.resumeShort" : "grid.pauseShort")}
          </button>
        )}
      </div>
      <ul className="grid h-[calc(100dvh-var(--header-offset,53px)-11.5rem)] min-h-[420px] grid-cols-3 grid-rows-3 gap-1 md:h-[calc(100dvh-7rem)] md:max-h-[860px]">
        {cells.map((cell, i) => (
          <li key={i} className="min-h-0">
            {cell ? (
              <GridSquare cell={cell} tiered={tiered} drift={!reducedMotion} onOpen={(reel) => onOpen(reel, shown)} />
            ) : (
              <div className="h-full w-full rounded-lg bg-gray-100" aria-hidden />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// One square: the post's still, cross-fading to the next once it has loaded.
function GridSquare({ cell, tiered, drift, onOpen }: { cell: Cell<Reel>; tiered: boolean; drift: boolean; onOpen: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(cell);
  const [incoming, setIncoming] = useState<Cell<Reel> | null>(null);
  const [ready, setReady] = useState(false);

  // A new post for this square: load it underneath, then fade it in.
  useEffect(() => {
    if (cell.item.id === current.item.id) return;
    setIncoming(cell);
    setReady(false);
    const timer = setTimeout(() => setReady(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  // Faded in: it becomes the square's post.
  useEffect(() => {
    if (!ready || !incoming) return;
    const timer = setTimeout(() => {
      setCurrent(incoming);
      setIncoming(null);
      setReady(false);
    }, 750);
    return () => clearTimeout(timer);
  }, [ready, incoming]);

  const reel = current.item;
  const place = reel.locationName || reel.caption.slice(0, 24) || reel.municipality.name;
  return (
    <button
      type="button"
      onClick={() => onOpen(reel)}
      aria-label={`${place}・${reel.municipality.name}${tiered ? `・${t(`grid.tier.${current.tier}`)}` : ""}`}
      className="on-media relative block h-full w-full overflow-hidden rounded-lg bg-gray-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-jz-accent"
    >
      <Still reel={reel} drift={drift} />
      {incoming && (
        <span className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
          <Still reel={incoming.item} drift={drift} onLoaded={() => setReady(true)} />
        </span>
      )}
      {tiered && (
        <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${TIER_CHIP[current.tier]}`}>
          {t(`grid.tier.${current.tier}`)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-6">
        <span className="block truncate text-[11px] font-bold leading-tight text-white">{place}</span>
        <span className="block truncate text-[10px] leading-tight text-white/80">
          {reel.municipality.prefecture}
          {reel.municipality.name}
          {reel.editorial && `・${t("grid.editorial")}`}
        </span>
      </span>
    </button>
  );
}

function Still({ reel, drift, onLoaded }: { reel: Reel; drift: boolean; onLoaded?: () => void }) {
  // #t=0.5 makes browsers paint a frame as a still; only the start of the file is fetched.
  return (
    <video
      key={reel.id}
      src={`${reel.videoUrl}#t=0.5`}
      muted
      playsInline
      preload="metadata"
      onLoadedData={onLoaded}
      aria-hidden
      tabIndex={-1}
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${drift ? "grid-drift" : ""}`}
    />
  );
}
