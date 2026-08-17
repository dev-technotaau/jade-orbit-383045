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

/**
 * Where browsers send CSP / NEL violation reports.
 *
 * These were hardcoded to `https://api.hireadda.in/api/csp-report`, so a client
 * deploying this module would have shipped its users' CSP and network-error
 * reports to a third party. Now it points at this app's own origin, which
 * serves the collector at src/app/api/csp-report/route.ts.
 *
 * The Reporting-Endpoints header requires absolute URLs, so this is derived
 * from NEXT_PUBLIC_APP_URL at build time.
 */
const REPORT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/csp-report`;

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  images: {
    /**
     * No remote image hosts.
     *
     * The host platform hardcoded Cloudinary, its own R2 domain and the Google
     * avatar CDN; this then allowed whatever NEXT_PUBLIC_R2_PUBLIC_URL named,
     * which on this deployment was the storage bucket's anonymous `*.r2.dev`
     * domain. That bucket is where every inbound WhatsApp attachment is
     * archived, and allowing it here made an unauthenticated fetch of customer
     * media a first-class part of the UI. Media is streamed through the backend
     * on this origin instead, which is what enforces the app password and the
     * media-id ownership check.
     */
    remotePatterns: [],
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
          // Cross-Origin-Opener-Policy — top-level browsing-context isolation.
          // `same-origin-allow-popups` rather than plain `same-origin`: the
          // host platform needed it for Google/LinkedIn OAuth popups, and it is
          // kept because strict same-origin severs `window.opener` for any
          // popup, which would break a future OAuth or payment window.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // NOT setting COEP — `require-corp` would require CORP headers on
          // every cross-origin subresource (an R2 bucket, if one is configured).
          // Re-evaluate if cross-origin isolated APIs are ever needed.
          {
            key: 'Permissions-Policy',
            // Razorpay's delegation went with the billing system. Turnstile's is back,
            // because the CAPTCHA layer is: the private-state-token pair lets
            // challenges.cloudflare.com redeem a Private Access Token and clear a
            // visitor silently. Unlisted features default to 'self', which excludes the
            // cross-origin frame and forces an interactive challenge on every unlock.
            // Browsers lacking the feature ignore the token, so this is safe to send.
            value:
              'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), publickey-credentials-get=(self), publickey-credentials-create=(self), interest-cohort=(), browsing-topics=(), clipboard-read=(self), clipboard-write=(self), display-capture=(), fullscreen=(self), picture-in-picture=(self), screen-wake-lock=(self), web-share=(self), xr-spatial-tracking=(self), gamepad=(), hid=(), idle-detection=(), local-fonts=(), storage-access=(self), private-state-token-issuance=(self "https://challenges.cloudflare.com"), private-state-token-redemption=(self "https://challenges.cloudflare.com")',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Reporting endpoint signal — browsers send CSP / NEL reports to this
          // group. `default` is the standard group name. See REPORT_URI above.
          {
            key: 'Reporting-Endpoints',
            value: `default="${REPORT_URI}", csp-endpoint="${REPORT_URI}", nel-endpoint="${REPORT_URI}"`,
          },
          // Report-To — older Reporting v0 header. Older Chromium /
          // Safari only consume Report-To; both ship together for
          // maximum browser coverage.
          {
            key: 'Report-To',
            value: `{"group":"default","max_age":10886400,"endpoints":[{"url":"${REPORT_URI}"}],"include_subdomains":true}`,
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
          // Tk — Tracking Status. `N` = not tracking. (The host platform paired
          // this with a /.well-known/dnt-policy.txt; that file was a
          // site-operator artifact and is gone, but the signal is still true —
          // this module has no analytics or advertising trackers at all.)
          { key: 'Tk', value: 'N' },
          // X-Robots-Tag — HTTP-layer counterpart to the page-level
          // `<meta name="robots">`. Every route here sits behind the unlock
          // cookie and the root layout already declares
          // `robots: { index: false, follow: false }`; this header states the
          // same thing one layer earlier, where it also covers what a <meta>
          // tag cannot:
          //   - non-HTML responses (the PWA manifest, icons, API routes);
          //   - crawlers that fetch HEAD-only, or short-circuit on headers
          //     before parsing any HTML.
          // The host platform ran a public job board, so its default was
          // `index, follow` and a second path-scoped rule re-stated `noindex`
          // over /auth, /portal and the dashboard roots. None of those paths
          // exist here, and re-scoping that rule to /whatsapp and /unlock would
          // emit X-Robots-Tag twice on every page, since this rule matches them
          // too. Nothing in this module is public, so one restrictive default
          // is both correct and unambiguous.
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, nosnippet, noarchive',
          },
          // CSP is managed by src/proxy.ts with per-request nonce
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
   * Enforce single-slash canonical URLs + eliminate trailing slashes, so
   * `/whatsapp/` and `/whatsapp` can never both resolve and a link built
   * either way lands on one URL.
   *
   * There is deliberately no rewrites() block. The host platform used one to
   * map `/sitemap.xml` and `/sitemap-N.xml` onto the shard files that its
   * `app/sitemap.ts` generated. This module has no sitemap route and nothing
   * public to list in one, so both rewrites only ever rewrote a 404 into a
   * different 404.
   */
  trailingSlash: false,

  async redirects() {
    // ── Legacy URL migration registry ────────────────────────────────────
    // Empty by design. Every entry the host platform kept here pointed at a
    // route this module does not have — /auth/reset-password, /employer/vendor,
    // an /images OG set and a /.well-known/security.txt — so each one was a 30x
    // straight into a 404. This app has two reachable prefixes, /unlock and
    // /whatsapp, and neither has ever moved.
    //
    // When something DOES move, add a 308 (permanent) entry here instead of
    // dropping the old URL, and keep it forever so bookmarks and links pasted
    // into a chat never break.
    //
    // Example patterns (uncomment + adapt when needed):
    //
    // Single-page moves:
    // {
    //   source: '/campaigns',
    //   destination: '/whatsapp/campaigns',
    //   permanent: true,
    // },
    //
    // Dynamic/wildcard moves (all paths under /inbox/* → /whatsapp/contacts/*):
    // {
    //   source: '/inbox/:slug*',
    //   destination: '/whatsapp/contacts/:slug*',
    //   permanent: true,
    // },
    //
    // Query-string-based move:
    // {
    //   source: '/search',
    //   has: [{ type: 'query', key: 'q' }],
    //   destination: '/whatsapp/contacts?search=:q',
    //   permanent: true,
    // },

    // The host platform's www→apex and http→https normalizations lived here,
    // both hardcoded to hireadda.in. Host normalization belongs to whatever
    // edge/platform a deployment sits behind (Vercel, Cloudflare, a load
    // balancer), not to a module that ships to many domains.
    return [];
  },
};

export default nextConfig;
