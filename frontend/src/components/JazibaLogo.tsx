// Wordmark for the app's provided logo design (bold red "Jaziza" lettering with a
// curved underline). Rendered as SVG text + a hand-drawn-style swoosh rather than
// an embedded raster image, so it stays crisp at any size and needs no asset file.
export default function JazibaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230 84" className={className} role="img" aria-label="Jaziba">
      <text
        x="6"
        y="54"
        fontFamily="'Baloo 2', 'Arial Rounded MT Bold', system-ui, sans-serif"
        fontWeight={800}
        fontSize="52"
        fill="#D6293C"
        letterSpacing="-1"
      >
        Jaziba
      </text>
      <path
        d="M14 68 C 70 82, 160 82, 216 64"
        stroke="#D6293C"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
