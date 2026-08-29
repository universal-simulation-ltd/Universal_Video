// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Mark: Universal Video — A film frame with sprockets and a play mark.
// Hover: The reel advances one frame and the play mark commits.
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.

const CSS = `
  /* Resting states */
  .uam-video-play { transform: translateX(-2px); opacity: 0.6; transition: transform .4s cubic-bezier(0.16,1,0.3,1), opacity .4s ease; }
  .uam-video-sprocket1 { transform: translateY(0); transition: transform .4s ease; }
  .uam-video-sprocket2 { transform: translateY(0); transition: transform .4s ease; }
  .uam-video-sprocket3 { transform: translateY(0); transition: transform .4s ease; }
  .uam-video-sprocket4 { transform: translateY(0); transition: transform .4s ease; }

  /* Active states */
  .uam-host-video:hover .uam-video-play,
  .uam-host-video:focus-visible .uam-video-play { transform: translateX(0); opacity: 1; }
  .uam-host-video:hover .uam-video-sprocket1,
  .uam-host-video:focus-visible .uam-video-sprocket1 { transform: translateY(3px); }
  .uam-host-video:hover .uam-video-sprocket2,
  .uam-host-video:focus-visible .uam-video-sprocket2 { transform: translateY(3px); }
  .uam-host-video:hover .uam-video-sprocket3,
  .uam-host-video:focus-visible .uam-video-sprocket3 { transform: translateY(3px); }
  .uam-host-video:hover .uam-video-sprocket4,
  .uam-host-video:focus-visible .uam-video-sprocket4 { transform: translateY(3px); }

  @media (prefers-reduced-motion: reduce) {
    .uam-video-play,
    .uam-video-sprocket1,
    .uam-video-sprocket2,
    .uam-video-sprocket3,
    .uam-video-sprocket4 { transition: none !important; }
  }
`

export default function ProductLogo() {
  return (
    <span
      className="uam-host-video inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
        <defs>
          <linearGradient id="uam-nav-video-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fe8c01" />
            <stop offset="1" stopColor="#e05504" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#uam-nav-video-tile)" />
        <rect x={8} y={14} width={48} height={36} rx={5} fill="none" strokeWidth={4} stroke="#ffffff" />
        <rect x={13} y={19} width={6} height={6} rx={1.4} fill="#fed7aa" className="uam-video-sprocket1" />
        <rect x={13} y={39} width={6} height={6} rx={1.4} fill="#fed7aa" className="uam-video-sprocket2" />
        <rect x={45} y={19} width={6} height={6} rx={1.4} fill="#fed7aa" className="uam-video-sprocket3" />
        <rect x={45} y={39} width={6} height={6} rx={1.4} fill="#fed7aa" className="uam-video-sprocket4" />
        <path d="M27 24 L41 32 L27 40 Z" fill="#ffffff" className="uam-video-play" />
      </svg>
    </span>
  )
}
