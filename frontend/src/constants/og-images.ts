/**
 * Open Graph image variants.
 *
 * Single source of truth consumed by:
 *   - src/app/layout.tsx (default site-wide OG + Twitter images)
 *   - src/components/common/SEO.tsx (per-page metadata builder)
 *   - src/lib/json-ld.ts (Organization schema `image` array)
 *
 * Ship the PNG file into `public/images/` at the declared dimensions before
 * listing a variant here — crawlers that fetch a 404 cache the miss and may
 * fall back gracefully or may not, depending on platform.
 *
 * Crawler behaviour per-variant:
 *   - wide  (1200×630, 1.91:1): Facebook, LinkedIn, Twitter/X summary_large_image,
 *     Slack, Discord, Google SERP cards — the baseline everyone picks first.
 *   - square (1200×1200, 1:1):   WhatsApp, iMessage, Slack inline attachments,
 *     iOS Messages preview — stops "wide image cropped to square" quality loss.
 *   - tall  (1000×1500, 2:3):    Pinterest pins, some mobile news feeds.
 *
 * Order matters: crawlers that pick the FIRST valid og:image (Facebook)
 * follow array order. Keep the wide hero first.
 */

export type OgImageKind = 'wide' | 'square' | 'tall';

export interface OgImageVariant {
  kind: OgImageKind;
  /** Path relative to public/ (absolute path resolved via metadataBase). */
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Toggle variants on/off by adding/removing entries. Only list files that
 * actually exist in `public/images/` — otherwise crawlers 404 on them.
 */
export const OG_IMAGE_VARIANTS: OgImageVariant[] = [
  {
    kind: 'wide',
    url: '/images/og-home.jpg',
    width: 1200,
    height: 630,
    alt: 'Hire Adda — Find Your Dream Job',
  },
  {
    kind: 'square',
    url: '/images/og-square.jpg',
    width: 1200,
    height: 1200,
    alt: 'Hire Adda — Find Your Dream Job',
  },
  {
    kind: 'tall',
    url: '/images/og-tall.jpg',
    width: 1000,
    height: 1500,
    alt: 'Hire Adda — Find Your Dream Job',
  },
];

/** Primary wide image — the one Facebook/LinkedIn pick first. */
export const OG_IMAGE_DEFAULT: OgImageVariant =
  OG_IMAGE_VARIANTS.find((v) => v.kind === 'wide') ?? OG_IMAGE_VARIANTS[0];

/** Twitter cards only support a single image URL — use the wide hero. */
export const TWITTER_IMAGE_URL: string = OG_IMAGE_DEFAULT.url;

/**
 * Override the alt text on all variants for a specific page. Useful when
 * a page needs a different caption than the default site-wide one.
 */
export function withAltOverride(alt: string): OgImageVariant[] {
  return OG_IMAGE_VARIANTS.map((v) => ({ ...v, alt }));
}
