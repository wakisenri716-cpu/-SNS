import { useRef } from "react";

// Distinguishes a single tap from a double tap on the same element
// (Instagram: double tap = like). The single-tap action waits briefly so it
// doesn't also fire on the first half of a double tap.
export function useTapGestures(onSingle: () => void, onDouble: () => void, delay = 250) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
      onDouble();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onSingle();
    }, delay);
  };
}
