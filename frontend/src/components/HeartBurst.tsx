import { Heart } from "lucide-react";

// The big heart that pops over a video on double-tap-to-like. Re-mount it
// (change `key`) to replay the animation.
export default function HeartBurst() {
  return (
    <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
      <Heart className="animate-heart-burst h-24 w-24 fill-white text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]" strokeWidth={0} />
    </span>
  );
}
