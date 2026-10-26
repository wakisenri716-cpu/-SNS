// Round profile picture (or initial). `ring` adds the Instagram-style
// gradient story ring around it.
export default function Avatar({
  name,
  src,
  size = 32,
  ring = false,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
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
    <span className="inline-flex shrink-0 rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]">
      <span className="block rounded-full bg-white p-[2px]">{inner}</span>
    </span>
  );
}
