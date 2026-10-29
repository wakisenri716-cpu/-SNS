import { useRef, useState, type PointerEvent } from "react";

// Drag-to-reorder for a vertical list, with mouse or finger: press the
// handle, the card follows the pointer, a line shows where it will land, and
// letting go commits the new order. Items are the elements marked
// data-drag-item inside the container. (Up/down buttons stay for keyboards.)
export function useDragReorder<T>(items: T[], onCommit: (next: T[]) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; offset: number } | null>(null);
  const start = useRef<{ y: number; rects: DOMRect[] } | null>(null);

  function handleProps(index: number) {
    return {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const els = [...(containerRef.current?.querySelectorAll<HTMLElement>("[data-drag-item]") ?? [])];
        start.current = { y: e.clientY, rects: els.map((el) => el.getBoundingClientRect()) };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from: index, to: index, offset: 0 });
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (!drag || !start.current) return;
        const offset = e.clientY - start.current.y;
        const { rects } = start.current;
        const center = rects[drag.from].top + rects[drag.from].height / 2 + offset;
        // Lands after every other item whose middle it has passed.
        const to = rects.filter((r, i) => i !== drag.from && r.top + r.height / 2 < center).length;
        setDrag({ ...drag, offset, to });
      },
      onPointerUp() {
        if (drag && drag.to !== drag.from) {
          const next = [...items];
          const [moved] = next.splice(drag.from, 1);
          next.splice(drag.to, 0, moved);
          onCommit(next);
        }
        setDrag(null);
        start.current = null;
      },
      onPointerCancel() {
        setDrag(null);
        start.current = null;
      },
      // The handle mustn't scroll the page on touch.
      style: { touchAction: "none" as const },
    };
  }

  // Where the drop line goes, as an index into the current list: before item
  // `insertAt` (items.length means after the last one).
  const insertAt = drag && drag.to !== drag.from ? (drag.to < drag.from ? drag.to : drag.to + 1) : null;

  return { containerRef, drag, insertAt, handleProps };
}
