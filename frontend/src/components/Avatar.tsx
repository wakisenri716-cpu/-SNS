// Round profile picture (or initial). `ring` adds a plain dark story ring
// around it, and `seen` turns the ring gray (stories already watched).
export default function Avatar({
  name,
  src,
  size = 32,
  ring = false,
  seen = false,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
  seen?: boolean;
}) {
  const inner = (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 font-semibold text-gray-600"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1)}
    </span>
  );
  if (!ring) return inner;
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-full p-[2.5px]">
      <span
        className={`absolute -inset-1/4 ${seen ? "bg-gray-300" : "bg-gray-900"}`}
        aria-hidden
      />
      <span className="relative block rounded-full bg-white p-[2px]">{inner}</span>
    </span>
  );
}
