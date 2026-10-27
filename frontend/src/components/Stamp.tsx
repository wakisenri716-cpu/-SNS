// A Jaziba visit stamp: a red, slightly rotated round stamp with the spot's
// name and date — the "旅の記念スタンプ" look. `fresh` plays the stamping
// animation.
export default function Stamp({
  place,
  date,
  size = 112,
  fresh = false,
}: {
  place: string;
  date: string;
  size?: number;
  fresh?: boolean;
}) {
  return (
    <span
      className={`stamp ${fresh ? "animate-stamp" : ""}`}
      style={{ width: size, height: size, fontSize: size / 9 }}
      role="img"
      aria-label={`${place} ${date}`}
    >
      <span className="stamp-ring">
        <span className="stamp-brand">JAZIBA</span>
        <span className="stamp-place">{place}</span>
        <span className="stamp-date">{date}</span>
      </span>
    </span>
  );
}
