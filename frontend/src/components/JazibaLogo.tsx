// Wordmark for the app's provided logo design (bold navy "Jaziba" lettering with a
// red dot standing in for the "i"'s dot). Rendered as SVG text + a circle rather
// than an embedded raster image, so it stays crisp at any size and needs no asset
// file. The "i" is set as a dotless ı so the font doesn't draw its own small dot
// underneath the red one.
export default function JazibaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230 84" className={className} role="img" aria-label="Jaziba">
      <text
        x="6"
        y="54"
        fontFamily="'Baloo 2', 'Arial Rounded MT Bold', system-ui, sans-serif"
        fontWeight={800}
        fontSize="52"
        fill="#111827"
        letterSpacing="-1"
      >
        Jazıba
      </text>
      <circle cx="96" cy="9" r="11" fill="#D6293C" />
    </svg>
  );
}
