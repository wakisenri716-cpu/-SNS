import { useRef, type PointerEvent } from "react";

const MAX_DEG = 7;

// 3D tilt toward the pointer, with a moving glare highlight (the element
// should contain a `.tilt-glare` layer). Mouse/trackpad only — touch screens
// and reduced-motion users get a still card. Styles are written straight to
// the element, so moving the pointer doesn't re-render React.
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const enabled =
    typeof window !== "undefined" &&
    matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onPointerMove(e: PointerEvent<T>) {
    const el = ref.current;
    if (!enabled || !el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * MAX_DEG}deg) rotateY(${(x - 0.5) * MAX_DEG}deg) scale(1.015)`;
    el.style.setProperty("--glare-x", `${x * 100}%`);
    el.style.setProperty("--glare-y", `${y * 100}%`);
    el.dataset.tilting = "true";
  }

  function onPointerLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    delete el.dataset.tilting;
  }

  return { ref, onPointerMove, onPointerLeave };
}
