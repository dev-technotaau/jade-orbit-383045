import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

/**
 * Cache policy for `public/` assets (icons, images).
 *
 * NOT `immutable`: unlike `/_next/static/*`, these filenames carry no content
 * hash, so a replaced logo would otherwise be pinned in caches for the full
 * max-age with no way to bust it. `stale-while-revalidate` gives the speed of a
 * long TTL while still letting an update propagate — caches serve the old file
 * for up to a week after it goes stale, but fetch the new one in the background
 * on the first request.
 *
 * HTML deliberately keeps Next's `no-store`. Every page carries a per-request
 * CSP nonce (proxy.ts), and a cached document would hand the same nonce to
 * every visitor sharing that cache entry — which is exactly what a nonce exists
 * to prevent.
 */
const STATIC_ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'assets.hireadda.in' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  compress: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-XSS-Protection', value: '0' },
          // Adobe / Flash legacy — disable cross-domain policy lookup.
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          // Process isolation — modern browsers run this origin in a
          // dedicated process. Reduces Spectre / cross-origin info leaks.
          { key: 'Origin-Agent-Cluster', value: '?1' },
          // Cross-Origin-Resource-Policy is NOT set here — it is applied by
          // the two path-scoped rules at the end of this array, so that a
          // given path never receives the header twice (duplicate CORP is
          // treated as invalid and fails closed).
          // Cross-Origin-Opener-Policy — top-level browsing-context
          // isolation. `same-origin-allow-popups` because the OAuth
          // flow opens Google/LinkedIn windows that we re-attach via
          // postMessage; strict same-origin would break that flow.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // NOT setting COEP — `require-corp` would break Cloudinary
          // images, Firebase auth iframes, and Stripe-hosted forms,
          // none of which ship CORP headers we control. Re-evaluate
          // when SharedArrayBuffer / cross-origin isolated APIs are
          // actually needed.
          {
            key: 'Permissions-Policy',
            // Delegations to cross-origin iframes:
            //   - challenges.cloudflare.com → picture-in-picture +
            //     xr-spatial-tracking. Turnstile probes these on load
            //     and the console floods with denial warnings otherwise;
            //     the widget doesn't actually use them.
            //   - api.razorpay.com → payment + accelerometer + gyroscope.
            //     Razorpay's risk-detection bundle (`loader.min.js`) runs
            //     device-motion biometrics inside the checkout iframe and
            //     the Payment Request API is needed for UPI / card flows.
            //     Without these the overlay still works but emits red
            //     "Permissions policy violation" entries on every checkout.
            // Both origins are already in `frame-src` of the CSP, so no
            // new security surface — we're just letting the iframes use
            // features they need.
            value:
              'camera=(), microphone=(self), geolocation=(self), payment=(self "https://api.razorpay.com"), usb=(), serial=(), bluetooth=(), accelerometer=(self "https://api.razorpay.com"), gyroscope=(self "https://api.razorpay.com"), magnetometer=(), midi=(), publickey-credentials-get=(self), publickey-credentials-create=(self), interest-cohort=(), browsing-topics=(), clipboard-read=(self), clipboard-write=(self), display-capture=(), fullscreen=(self), picture-in-picture=(self "https://challenges.cloudflare.com"), screen-wake-lock=(self), web-share=(self), xr-spatial-tracking=(self "https://challenges.cloudflare.com"), gamepad=(), hid=(), idle-detection=(), local-fonts=(), storage-access=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Reporting endpoint signal — browsers send CSP / NEL reports
          // to this group. `default` is the standard group name.
          //
          // Targets the API origin, matching CSP's own report-uri and the
          // runtime override in proxy.ts. These previously pointed at the app
          // origin while CSP pointed at the API origin — both endpoints exist
          // and return 204, so nothing was lost, but the split made reports
          // land in two different places. For NEL specifically the API origin
          // is also the better target: a network error reaching hireadda.in is
          // likelier to be reportable via a different host.
          {
            key: 'Reporting-Endpoints',
            value:
              'default="https://api.hireadda.in/api/csp-report", csp-endpoint="https://api.hireadda.in/api/csp-report", nel-endpoint="https://api.hireadda.in/api/csp-report"',
          },
          // Report-To — older Reporting v0 header. Older Chromium /
          // Safari only consume Report-To; both ship together for
          // maximum browser coverage.
          {
            key: 'Report-To',
            value:
              '{"group":"default","max_age":10886400,"endpoints":[{"url":"https://api.hireadda.in/api/csp-report"}],"include_subdomains":true}',
          },
          // Network Error Logging — when a request fails (DNS, TCP, TLS,
          // 5xx), browsers send a structured report to the reporting
          // group. Captures CDN flakes / connection issues that never
          // reach our access logs.
          {
            key: 'NEL',
            value:
              '{"report_to":"default","max_age":2592000,"include_subdomains":true,"success_fraction":0,"failure_fraction":1}',
          },
          // Server-Timing — surfaces backend timing breakdowns in the
          // browser DevTools Network panel. The CORS allow-list lets
          // client-side WebVitals read the values.
          { key: 'Timing-Allow-Origin', value: '*' },
          // Tk — Tracking Status. We don't track DNT users (see
          // /.well-known/dnt-policy.txt), so `N` = not tracking.
          { key: 'Tk', value: 'N' },
          // X-Robots-Tag — HTTP-layer counterpart to the page-level
          // `<meta name="robots">`. Same directives we already declare
          // via Next.js metadata, but emitted as a response header so
          // they apply to:
          //   - non-HTML responses (PDFs, images, OG-image SVGs) where
          //     a <meta> tag isn't possible;
          //   - crawlers that fetch HEAD-only or short-circuit on
          //     headers before parsing HTML.
          // Auth + portal paths get a stricter `noindex, nofollow,
          // nosnippet, noarchive` further down so the two layers
          // agree on every page. When HTML and HTTP signals
          // disagree, Google honours the MOST restrictive, so a
          // permissive default here can never accidentally
          // un-noindex a page that's noindex'd in HTML.
          {
            key: 'X-Robots-Tag',
            value: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
          },
          // CSP is managed by src/proxy.ts with per-request nonce
        ],
      },
      {
        // Auth + portal + every dashboard root must never be
        // indexed. Mirrors the
        // `robots: { index: false, follow: false }` metadata
        // declared in:
        //   - src/app/auth/layout.tsx
        //   - src/app/portal/login/page.tsx
        //   - src/app/candidate/layout.tsx
        //   - src/app/employer/layout.tsx
        //   - src/app/admin/layout.tsx
        //   - src/app/super-admin/layout.tsx
        //   - src/app/notifications/layout.tsx
        // The HTTP header signal lets crawlers drop these out of the
        // queue without spending HTML-parse budget on the response.
        // The public `/vendors` directory is NOT caught here because
        // its path token is `vendors`, not `vendor`. The legacy
        // `/vendor` prefix stays so the 308 redirects to
        // /employer/vendor are never indexed.
        source: '/(auth|portal|candidate|employer|admin|super-admin|notifications|vendor)/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, nosnippet, noarchive',
          },
        ],
      },
      {
        source: '/.well-known/mta-sts.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        source: '/.well-known/security.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // Apple Universal Links — must be served as JSON WITHOUT a file
        // extension, and Content-Type must be application/json. Apple's
        // swcd crawler is strict about both.
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // Android Digital Asset Links — JSON, standard Content-Type.
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // Global Privacy Control — JSON, served at .well-known/gpc.json
        source: '/.well-known/gpc.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // EFF DNT Policy — plain text. Advisory (RFC 7231 / EFF DNT v1.0).
        source: '/.well-known/dnt-policy.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // Private prefetch proxy directives — JSON, custom MIME.
        source: '/.well-known/traffic-advice',
        headers: [{ key: 'Content-Type', value: 'application/trafficadvice+json' }],
      },
      {
        // llms-full.txt — extended deep-crawl manifest companion to llms.txt.
        source: '/llms-full.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // carbon.txt — sustainability / green-hosting disclosure.
        source: '/carbon.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // humans.txt — plain-text team credits.
        source: '/humans.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // ads.txt — plain-text IAB declaration.
        source: '/ads.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // ai.txt — Spawning.ai training opt-out.
        source: '/ai.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // llms.txt — LLM content-use policy (llmstxt.org convention).
        source: '/llms.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      {
        // OpenSearch description document — serves the browser search-engine
        // add-to-browser convention. Content-Type is specific.
        source: '/opensearch.xml',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/opensearchdescription+xml; charset=utf-8',
          },
        ],
      },

      // ── Cross-Origin-Resource-Policy, applied exactly once per path ──
      //
      // Brand assets under /icons are embedded in OUTBOUND EMAIL, which means
      // they are loaded by pages we do not control: a webmail client, a
      // temp-mail viewer, or a sandboxed preview iframe (an empty `sandbox`
      // attribute gives the frame an OPAQUE origin, which CORP also treats as
      // cross-site). Under the previous blanket `same-site` every one of
      // those blocked the logo.
      //
      // Gmail hid the problem: it proxies images through googleusercontent,
      // and a server-side fetch never evaluates CORP — so the logo appeared
      // to work while being broken in every non-proxying client.
      //
      // These are public brand images with no user data, so `cross-origin`
      // costs nothing. Everything else keeps `same-site`.
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          // Cache-Control is added to THIS rule rather than a second
          // `/icons/:path*` entry — duplicate sources emit the header twice.
          { key: 'Cache-Control', value: STATIC_ASSET_CACHE },
        ],
      },
      {
        // Same treatment for public/images. Both directories were falling back
        // to Cloudflare's 4h default (`max-age=14400`, cf-cache-status
        // REVALIDATED), because nothing in the app set Cache-Control for them.
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE }],
      },
      {
        // `(?!icons(?:/|$))` — excludes the bare /icons path too, so no path
        // ever matches BOTH rules and receives the header twice.
        source: '/:path((?!icons(?:/|$)).*)',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-site' }],
      },
    ];
  },
  /**
   * Enforce single-slash canonical URLs + eliminate trailing slashes.
   * Combined with Next.js's default `trailingSlash: false`, this prevents
   * duplicate-content penalties from URL variants like:
   *   /about/    → /about
   *   /ABOUT     → /about (case normalization via redirects below)
   */
  trailingSlash: false,

  async rewrites() {
    return {
      // `/sitemap.xml` is the conventional path crawlers — and Google Search
      // Console submissions — try first. But `app/sitemap.ts` uses
      // generateSitemaps(), so Next serves the shard files at
      // `/sitemap/{id}.xml` and leaves a bare `/sitemap.xml` 404ing. Serve the
      // canonical <sitemapindex> there instead. A rewrite (not a redirect)
      // keeps it a direct 200 XML response, which Google prefers for sitemaps.
      // The real index route still lives at /sitemap-index.xml (robots.txt
      // primary); we can't add app/sitemap.xml/route.ts — it collides with the
      // metadata route Next reserves for that path.
      beforeFiles: [
        { source: '/sitemap.xml', destination: '/sitemap-index.xml' },
        /**
         * Expose every shard at a ROOT-LEVEL path.
         *
         * This is the fix for Google reading only 1 of 11 child sitemaps. The
         * sitemap protocol scopes a sitemap file to its own directory: a file
         * served from `/sitemap/0.xml` may only list URLs under
         * `https://host/sitemap/`. Our shards live there (Next's
         * `generateSitemaps()` hardcodes that layout) but every URL inside them
         * is at the site root — `/`, `/jobs/...`, `/companies/...` — so all of
         * them are out of scope and get dropped. `/sitemap-news.xml` was the
         * only child Google accepted precisely because it sits at the root.
         *
         * Rewriting rather than moving the files keeps `generateSitemaps()`
         * untouched: `/sitemap-4.xml` serves what `/sitemap/4.xml` generates,
         * and because the served path is now at the root it may legally list
         * root URLs. Both paths keep working; the index advertises the root one.
         *
         * `([0-9]+)` keeps this off `/sitemap-index.xml` and `/sitemap-news.xml`,
         * and avoids a `\d` escape that a JS string literal would silently eat.
         *
         * @see https://www.sitemaps.org/protocol.html#location
         */
        { source: '/sitemap-:id([0-9]+).xml', destination: '/sitemap/:id.xml' },
      ],
    };
  },

  async redirects() {
    return [
      // ── Canonical / well-known ─────────────────────────────────────────
      {
        // RFC 8615 well-known convention. Password managers probe this
        // URL when a user wants to rotate their credentials, and browsers
        // (Chrome, Edge) surface a "Change password" button in the
        // compromised-credentials UI when it's present.
        source: '/.well-known/change-password',
        destination: '/auth/reset-password',
        permanent: false, // 307 — URL could change between releases
      },
      {
        // Legacy top-level security.txt. RFC 9116 §3 mandates
        // /.well-known/security.txt as the canonical location, but many
        // scanners, bug-bounty triage tools and researchers still probe the
        // root first — where we were returning 404. A 301 costs nothing and
        // means a would-be reporter always lands on the real policy.
        source: '/security.txt',
        destination: '/.well-known/security.txt',
        permanent: true, // 301 — the canonical location is fixed by the RFC
      },
      {
        // OG images moved .png -> .jpg (2026-08-02) when they were re-encoded
        // to fit WhatsApp's ~300KB preview ceiling. Googlebot had the .png
        // URLs indexed via the image-sitemap entries in sitemap.ts and began
        // 404ing on them immediately — confirmed in the ingress log, the only
        // genuine Googlebot errors in a 24h window.
        //
        // Social scrapers cache og:image URLs for a long time, so old shares
        // on Facebook/LinkedIn/X still reference the .png. Without this they
        // silently lose their preview image.
        source: '/images/:name(og-home|og-square|og-tall).png',
        destination: '/images/:name.jpg',
        permanent: true, // 301 — the rename is final
      },

      // ── Legacy URL migration registry ──────────────────────────────────
      // When content moves, add a 308 (permanent) entry here. Google
      // transfers PageRank through 308s; keep entries forever so
      // deep-linked old URLs never break.

      // Vendor role merged into employer (June 2026): the vendor
      // dashboard moved under /employer/vendor and the dedicated vendor
      // auth pages were retired. Keep these so old emails / bookmarks
      // (e.g. lead-notification "/vendor/leads" links) keep working.
      {
        source: '/vendor/:path*',
        destination: '/employer/vendor/:path*',
        permanent: true,
      },
      {
        source: '/vendor',
        destination: '/employer/vendor',
        permanent: true,
      },
      {
        source: '/auth/login/vendor',
        destination: '/auth/login/employer',
        permanent: true,
      },
      {
        source: '/auth/register/vendor',
        destination: '/auth/register/employer',
        permanent: true,
      },
      //
      // Example patterns (uncomment + adapt when needed):
      //
      // Single-page moves:
      // {
      //   source: '/jobs-in-india',
      //   destination: '/jobs?location=india',
      //   permanent: true,
      // },
      //
      // Dynamic/wildcard moves (all paths under /old-blog/* → /blog/*):
      // {
      //   source: '/old-blog/:slug*',
      //   destination: '/blog/:slug*',
      //   permanent: true,
      // },
      //
      // Query-string-based move:
      // {
      //   source: '/search',
      //   has: [{ type: 'query', key: 'q' }],
      //   destination: '/candidate/jobs?search=:q',
      //   permanent: true,
      // },

      // ── WWW → apex normalization ───────────────────────────────────────
      // Cloudflare handles this at the edge when proxying, but keep a
      // fallback in case CF is bypassed (direct origin access, misconfig).
      // 308 preserves the request method (unlike 301 which downgrades to GET).
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.hireadda.in' }],
        destination: 'https://hireadda.in/:path*',
        permanent: true,
      },

      // ── HTTP → HTTPS fallback ──────────────────────────────────────────
      // HSTS + Cloudflare handle this. This is a safety net for the first
      // request from a fresh browser that hasn't seen the HSTS header yet.
      // (Next.js middleware can't do protocol-based redirects directly;
      // this relies on the `x-forwarded-proto` header from the proxy.)
      //
      // Left commented because Cloudflare already enforces — enabling here
      // would cause redirect loops. Uncomment only if CF is ever removed.
      //
      // {
      //   source: '/:path*',
      //   has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      //   destination: 'https://hireadda.in/:path*',
      //   permanent: true,
      // },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'technotaau-rn',

  project: 'hire-adda-web',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Don't fail the build when sourcemap upload errors (expired/invalid
  // SENTRY_AUTH_TOKEN, transient API failure). Sourcemaps are an
  // observability enhancement — the deploy itself shouldn't block on them.
  errorHandler: (err) => {
    console.warn('[sentry] sourcemap upload failed (non-fatal):', err.message);
  },

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
