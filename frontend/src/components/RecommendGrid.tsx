import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { GRID_LAYOUT, GridRotation, swapOrder, type Cell, type Pools } from "../lib/gridRotation";
import type { Reel } from "../types";

// How often one square changes (each square changes about every 9 × this).
const SWAP_MS = 2600;
// A new post that won't load in time is shown anyway.
const LOAD_TIMEOUT_MS = 4000;

// A long scroll stops adding blocks here (posts repeat well before).
const MAX_BLOCKS = 60;

const idsOf = (blocks: (Cell<Reel> | null)[][]) => new Set(blocks.flatMap((cells) => cells.flatMap((c) => (c ? [c.item.id] : []))));

// おすすめ 9マス: nine posts per screen — 2 定番, 3 注目 and 4 穴場 towns —
// and another nine below as you scroll, on and on. In each block on screen
// one square at a time changes to another post from the same pool. Pauses
// with the button, in a background tab, while a post is open, and starts
// paused with reduced motion; blocks off screen don't change, and ones far
// away don't load their stills. Without tiers (saved, following, nearby) it
// goes through the list as it comes.
export default function RecommendGrid({
  pools,
  active,
  onOpen,
}: {
  pools: Pools<Reel>;
  /** False while a post is open over the grid. */
  active: boolean;
  /** The post tapped, and the nine of its block (for swiping in the viewer). */
  onOpen: (reel: Reel, block: Reel[]) => void;
}) {
  const { t } = useTranslation();
  const rotation = useMemo(() => new GridRotation(pools), [pools]);
  // The blocks, started over when the pools change (tab change, refresh).
  const [state, setState] = useState(() => ({ rotation, blocks: [rotation.fill()] }));
  if (state.rotation !== rotation) setState({ rotation, blocks: [rotation.fill()] });
  const blocks = state.blocks;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [paused, setPaused] = useState(!!reducedMotion);
  const [pageShown, setPageShown] = useState(() => typeof document === "undefined" || !document.hidden);
  // Blocks on screen (they change) and near it (they load their stills).
  const [visible, setVisible] = useState<Set<number>>(() => new Set([0]));
  const [near, setNear] = useState<Set<number>>(() => new Set([0]));
  const visibleRef = useRef(visible);
  const blockEls = useRef<(HTMLUListElement | null)[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Per block: the order its squares change in, and where it is.
  const orders = useRef(new Map<number, { order: number[]; step: number }>());

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    orders.current.clear();
  }, [rotation]);

  useEffect(() => {
    const onChange = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Which blocks are on screen / near it.
  useEffect(() => {
    const watch = (setter: typeof setVisible, options: IntersectionObserverInit) => {
      const observer = new IntersectionObserver((entries) => {
        setter((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.block);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      }, options);
      for (const el of blockEls.current.slice(0, blocks.length)) if (el) observer.observe(el);
      return observer;
    };
    const onScreen = watch(setVisible, { threshold: 0.15 });
    const nearby = watch(setNear, { rootMargin: "150% 0px" });
    return () => {
      onScreen.disconnect();
      nearby.disconnect();
    };
  }, [blocks.length]);

  // Scrolled near the end: another nine below.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || blocks.length >= MAX_BLOCKS || rotation.size === 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState((prev) => (prev.rotation !== rotation || prev.blocks.length >= MAX_BLOCKS ? prev : { rotation, blocks: [...prev.blocks, rotation.fillBlock(idsOf(prev.blocks))] }));
      },
      { rootMargin: "100% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [blocks.length, rotation]);

  const running = !paused && pageShown && active && visible.size > 0 && rotation.size > GRID_LAYOUT.length;
  useEffect(() => {
    if (!running) return;
    const nextSquare = (block: number) => {
      let o = orders.current.get(block);
      if (!o || o.step >= o.order.length) {
        o = { order: swapOrder(GRID_LAYOUT.length), step: 0 };
        orders.current.set(block, o);
      }
      return o.order[o.step++];
    };
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.rotation !== rotation) return prev;
        const everywhere = idsOf(prev.blocks);
        let changed = false;
        const blocks = prev.blocks.map((cells, b) => {
          if (!visibleRef.current.has(b)) return cells;
          const index = nextSquare(b);
          const own = new Set(cells.flatMap((c) => (c ? [c.item.id] : [])));
          const next = rotation.take(GRID_LAYOUT[index], everywhere, own);
          if (!next) return cells;
          everywhere.add(next.item.id);
          changed = true;
          const copy = [...cells];
          copy[index] = next;
          return copy;
        });
        return changed ? { rotation, blocks } : prev;
      });
    }, SWAP_MS);
    return () => clearInterval(timer);
  }, [running, rotation]);

  return (
    <section aria-label={t("grid.label")} className="pt-1">
      {rotation.size > GRID_LAYOUT.length && (
        <div className="flex justify-end px-2 pb-1">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={t(paused ? "grid.resume" : "grid.pause")}
            title={t(paused ? "grid.resume" : "grid.pause")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      <div className="space-y-[2px]">
        {blocks.map((cells, b) => {
          const block = cells.flatMap((c) => (c ? [c.item] : []));
          return (
            <ul
              key={b}
              ref={(el) => {
                blockEls.current[b] = el;
              }}
              data-block={b}
              className="grid h-[calc(100dvh-var(--header-offset,53px)-11.5rem)] min-h-[420px] grid-cols-3 grid-rows-3 gap-[2px] md:h-[calc(100dvh-7rem)] md:max-h-[860px]"
            >
              {cells.map((cell, i) => (
                <li key={i} className="min-h-0">
                  {cell && near.has(b) ? (
                    <GridSquare cell={cell} drift={!reducedMotion} onOpen={(reel) => onOpen(reel, block)} />
                  ) : (
                    <div className="h-full w-full bg-gray-100" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          );
        })}
      </div>
      <div ref={sentinelRef} aria-hidden />
    </section>
  );
}

// One square: the post's still, cross-fading to the next once it has loaded.
function GridSquare({ cell, drift, onOpen }: { cell: Cell<Reel>; drift: boolean; onOpen: (reel: Reel) => void }) {
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
      aria-label={`${place}・${reel.municipality.name}`}
      className="on-media relative block h-full w-full overflow-hidden bg-gray-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-jz-accent"
    >
      <Still reel={reel} drift={drift} />
      {incoming && (
        <span className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
          <Still reel={incoming.item} drift={drift} onLoaded={() => setReady(true)} />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-6">
        <span className="block truncate text-px10 font-bold leading-tight text-white">{place}</span>
        <span className="block truncate text-px9 leading-tight text-white/80">
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
