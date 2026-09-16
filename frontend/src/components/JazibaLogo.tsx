// The exact logo file the user provided, not a redrawn approximation.
// See public/brand/jaziba-logo.png (cropped/transparentized from their original upload).
export default function JazibaLogo({ className }: { className?: string }) {
  return <img src="/brand/jaziba-logo.png" alt="Jaziba" className={className} />;
}
