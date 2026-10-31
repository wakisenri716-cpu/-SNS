// The Jaziba logo from the logo kit the user provided (public/brand/): the
// four-tile mosaic mark and the "jaziba" wordmark in Outfit ExtraBold, with
// the letters outlined so it doesn't depend on a web font. The dark version
// (white letters, lighter blue tile) shows in dark mode.
export default function JazibaLogo({ className }: { className?: string }) {
  return (
    <>
      <img src="/brand/jaziba-logo-light.svg" alt="Jaziba" className={`dark:hidden ${className ?? ""}`} />
      <img src="/brand/jaziba-logo-dark.svg" alt="Jaziba" className={`hidden dark:block ${className ?? ""}`} />
    </>
  );
}
