import { DEFAULT_UNIVERSAL_APPS_PRODUCTS, type SuiteProduct } from '@unisim/sdk'

// The navbar reads the product's DISPLAY NAME from the apps catalogue, not from
// the `productLogo` we hand it — `products.find(p => p.id === product)?.name`.
// `video` is in the SDK's `SuiteProductId` union (0.85.0) but not yet in
// `DEFAULT_UNIVERSAL_APPS_PRODUCTS`, so with the stock catalogue the bar would
// render our icon with no name beside it and no Video entry in the switcher.
// Universal Beam hit exactly this two days ago; this is the same shim.
//
// So we append one locally. This is a temporary shim with a clear exit: the
// moment the SDK ships a `video` entry, delete this file and drop the `products`
// prop from App.tsx — the stock catalogue will already say the same thing.
//
// (`category: 'everyday'` matters. The switcher only lists products sharing the
// current product's category, so an uncategorised Video would show the business
// apps alongside the everyday ones.)

const VIDEO_GLYPH = (
  <svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="5" width="12" height="12" rx="2.5" />
    <path d="M14.5 9.5 19.5 6.5v9l-5-3z" />
  </svg>
)

export const VIDEO_PRODUCT_ENTRY: SuiteProduct = {
  id: 'video',
  name: 'Universal Video',
  desc: 'Compress a video without uploading it',
  href: 'https://opensource.unisim.co.uk/video',
  glyph: VIDEO_GLYPH,
  category: 'everyday',
}

export const VIDEO_CATALOGUE: SuiteProduct[] =
  DEFAULT_UNIVERSAL_APPS_PRODUCTS.some((p) => p.id === 'video')
    ? DEFAULT_UNIVERSAL_APPS_PRODUCTS
    : [...DEFAULT_UNIVERSAL_APPS_PRODUCTS, VIDEO_PRODUCT_ENTRY]
