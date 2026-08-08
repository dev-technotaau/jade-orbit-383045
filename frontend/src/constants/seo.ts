/**
 * Site-wide SEO constants consumed by layout.tsx, SEO.tsx, and the
 * structured-data builders. Central place to tune brand-level values.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  Placeholder convention
 * ──────────────────────────────────────────────────────────────────────
 *
 * Any field awaiting an external credential uses the literal token
 * `REPLACE_WITH_REAL_ID`. This is visible in source code AND is detected
 * by `scripts/validate-structured-data.mjs` — CI lists every remaining
 * placeholder with file:line on every build. Set STRICT_SEO=1 in the
 * CI environment to convert those warnings into build-failing errors.
 *
 * Consumers (layout.tsx, SEO.tsx) treat `REPLACE_WITH_REAL_ID` as "not
 * set" — no garbage meta tag is emitted to production HTML — while the
 * marker remains grep-able in the source for any developer or CI check.
 *
 * Helper to test whether a config value is still a placeholder:
 */
export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value === 'REPLACE_WITH_REAL_ID' || value.startsWith('REPLACE_WITH_');
}

/** Returns `value` if it's real, or `undefined` if it's still a placeholder. */
export function realOrUndef(value: string | undefined | null): string | undefined {
  return isPlaceholder(value) ? undefined : value!;
}

export const SEO_CONFIG = {
  // ── Brand ───────────────────────────────────────────────────────────
  siteName: 'Hire Adda',
  legalName: 'Opportunity Makers Group',
  siteSlogan: 'Where Talent Meets Opportunity',
  description:
    "India's leading job portal and recruitment platform. Find top jobs, hire the best talent, and build your career with Hire Adda.",
  defaultTitle: 'Hire Adda — Find Your Dream Job',
  titleTemplate: '%s | Hire Adda',

  // Locale / region ── used by hreflang, geo tags, Google Business
  locale: 'en_IN',
  lang: 'en-IN',
  region: 'IN',
  /** Approximate geographic center of India (ICBM / geo.position). */
  coordinates: { lat: 20.5937, lon: 78.9629 },
  placeName: 'India',
  currency: 'INR',

  // ── Colours ─────────────────────────────────────────────────────────
  themeColor: '#1E5CAF', // light theme
  themeColorDark: '#111A2E', // dark theme — matches pretty-page surface
  accentColor: '#F5880A',
  backgroundColor: '#FFFFFF',

  // ── Social handles ──────────────────────────────────────────────────
  twitterHandle: '@hireadda',
  fbAppId: 'REPLACE_WITH_REAL_ID', // Meta Developer → App Dashboard → App ID
  fbPage: 'REPLACE_WITH_REAL_ID', // Full URL, e.g. 'https://www.facebook.com/hireadda'

  // ── Verification IDs — all detected by scripts/validate-structured-data.mjs
  // while still set to REPLACE_WITH_REAL_ID. Populate as each account is linked.
  verification: {
    google: '6t6H27efXgrkrxH7xHPuqe-MQ8cuH0tPCN4qpEGsHPQ', // Search Console → HTML tag verification
    bing: 'EBDFBE5D1DEF42A491D7B9391A636C39', // Bing Webmaster → `msvalidate.01` value
    yandex: '93fdd397728b3ddc', // Yandex Webmaster → meta content value
    pinterest: 'd48fc1f32fcc73aef3817076dd8f557f', // Pinterest → domain claim token
    facebook: 'REPLACE_WITH_REAL_ID', // Meta Business → domain verification
    baidu: 'REPLACE_WITH_REAL_ID', // Baidu webmaster (China market)
    norton:
      'AJVDSXU2P0-XMHO8JLCSIMMY2HKHM24GQFY2VFR6O-QZJAEH467-COACZQQ3ZRLA7ROUS1F3-38TI3FESK631H5PV2AW9YFZXZNZBMIA219AQ4TGPT3OPNL9LLPVM73I', // Norton safe-web verification
    naver: 'REPLACE_WITH_REAL_ID', // Naver (Korea) site ownership
  },

  // ── App Links (Apple Universal / Android App Links) ─────────────────
  apps: {
    iosAppId: 'REPLACE_WITH_REAL_ID', // e.g. 'id1234567890' from App Store Connect
    iosAppName: 'Hire Adda',
    androidPackage: 'in.hireadda.app',
    androidAppName: 'Hire Adda',
    /** Base deep-link scheme for both iOS/Android. */
    urlScheme: 'hireadda',
  },

  // ── Publisher info for Dublin Core + OpenGraph article attribution ─
  publisher: 'Hire Adda',
  author: 'Hire Adda Team',
  copyrightYear: new Date().getFullYear(),

  // ── Site dates ─
  // ISO 8601 strings.
  //
  // `siteLaunchDate` — canonical born-on date for the platform.
  // Drives `article:published_time` meta + JSON-LD `datePublished`
  // on the homepage and any page that doesn't override with a more
  // specific content date.
  //
  // `siteLastModified` — auto-bumped on every commit by the CI
  // pipeline. The `.github/workflows/cd.yml` build job runs
  // `git log -1 --format=%cI` to get the current commit's ISO
  // 8601 committer timestamp and forwards it as a Docker
  // `NEXT_PUBLIC_SITE_LAST_MODIFIED` build-arg, which the
  // Dockerfile bakes into the bundle. So every prod deploy ships a
  // fresh modified-date stamp matching the actual git history;
  // crawlers see real freshness rather than a stale hand-edited
  // value. The literal fallback string is only used by local dev
  // builds (where the env var isn't set) — never reaches prod.
  siteLaunchDate: '2026-04-01T00:00:00+05:30',
  siteLastModified: process.env.NEXT_PUBLIC_SITE_LAST_MODIFIED ?? '2026-04-01T00:00:00+05:30',
} as const;

export type SeoConfig = typeof SEO_CONFIG;
