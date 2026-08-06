// Universal Video brand icon — icon-only by design. The SDK's
// UniversalAppsNavBar renders the product name beside this slot (from the apps
// catalogue), so putting a wordmark here would print the name twice.
//
// A frame with a play tab: the product takes one video file and gives back the
// same video, smaller. Not a scissors, not a wand — nothing here edits.
export default function ProductLogo() {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-orange-600 text-white"
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.6" y="3.6" width="8.6" height="8.8" rx="1.8" />
        <path d="M10.6 6.8 14.4 4.6v6.8l-3.8-2.2z" />
      </svg>
    </span>
  )
}
