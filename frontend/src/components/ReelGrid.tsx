import AutoplayVideo from "./AutoplayVideo";
import type { Reel } from "../types";

// Grid thumbnail: video only, no icon/caption until the viewer opens it.
export default function ReelThumb({ reel, onOpen }: { reel: Reel; onOpen: (reel: Reel) => void }) {
  return (
    <button onClick={() => onOpen(reel)} className="relative block w-full overflow-hidden bg-black text-left">
      <AutoplayVideo src={reel.videoUrl} className="aspect-video w-full object-cover" />
    </button>
  );
}
