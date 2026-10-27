// The exact logo file the user provided, not a redrawn approximation.
// See public/brand/jaziba-logo.png (cropped/transparentized from their original upload).
// In dark mode it is recolored with a CSS filter (.logo-adaptive in index.css).
export default function JazibaLogo({ className }: { className?: string }) {
  return <img src="/brand/jaziba-logo.png" alt="Jaziba" className={`logo-adaptive ${className ?? ""}`} />;
}
