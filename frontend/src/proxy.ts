import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Create a NextResponse.next() with CSP nonce headers attached.
 *
 * CSP notes:
 * - script-src uses the canonical "graceful-degradation" pattern recommended
 *   by Google's csp-evaluator + Lighthouse: per-request nonce + 'strict-dynamic'
 *   + 'unsafe-inline' + host allowlist. Modern browsers (CSP3) honor the nonce
 *   and IGNORE 'unsafe-inline' / host allowlists; 'strict-dynamic' then trusts
 *   any further scripts dynamically inserted by nonce'd code (no need to keep
 *   the host allowlist in sync with every third-party CDN they pull in).
 *   Legacy browsers (CSP2-only) fall back to 'unsafe-inline' + the explicit
 *   host allowlist. This sidesteps the "host allowlists can be bypassed"
 *   warning from Lighthouse without breaking older clients.
 * - style-src requires 'unsafe-inline' — Next.js/Tailwind inject non-nonce'd inline styles
 *   at build & runtime. This is a known framework limitation, not removable without breakage.
 * - frame-ancestors 'none' is the modern CSP3 replacement for X-Frame-Options: DENY
 * - report-to (Reporting API v1) sent alongside deprecated report-uri for forward compat
 * - require-trusted-types-for is intentionally NOT enabled: third-party scripts
 *   (analytics, Razorpay checkout) and parts of React/Next.js still write to
 *   DOM sinks without TT policies. Rolling this out safely needs a long
 *   report-only observation period first.
 */
function nextWithCsp(): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();

  const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
  const reportUri = `${apiUrl}/api/csp-report`;

  // Derive WebSocket URL from API URL (http→ws, https→wss)
  const wsUrl = apiUrl.replace(/^http/, 'ws');

  // Firebase RTDB uses dynamic server hostnames for long-polling (e.g.
  // s-gke-apse1-nssi2-0.asia-southeast1.firebasedatabase.app), so we need a
  // wildcard on the regional subdomain, not just the specific DB hostname.
  const firebaseDbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '';
  // Build both https:// and wss:// wildcards — Firebase RTDB uses WebSocket
  // for realtime sync and falls back to long-polling (HTTPS) on restricted networks.
  const firebaseDbRegion = firebaseDbUrl
    ? new URL(firebaseDbUrl).hostname.split('.').slice(1).join('.')
    : '';
  const firebaseDbWildcard = firebaseDbRegion
    ? `https://*.${firebaseDbRegion} wss://*.${firebaseDbRegion}`
    : '';

  // ─── Analytics provider allowlist ──────────────────────────────────
  // Each entry is grouped so it's obvious which domains belong to which
  // provider. Updating a provider? Touch the matching block + the
  // corresponding <ProviderPixel> component, never one without the other.
  //
  //   Google Analytics 4 + GTM …… google-analytics.com, googletagmanager.com
  //   Facebook Pixel ……………………… connect.facebook.net, facebook.com (px),
  //                                facebook.com (tr beacon image)
  //   Microsoft Clarity ………………… clarity.ms, c.clarity.ms, c.bing.com
  //   LinkedIn Insight Tag …………… snap.licdn.com (loader),
  //                                px.ads.linkedin.com (beacon)
  //   Contentsquare (ex-Hotjar) … t.contentsquare.net (loader),
  //                                *.contentsquare.net (telemetry +
  //                                heatmap iframe). Contentsquare
  //                                acquired Hotjar in Oct 2023 and
  //                                migrated all accounts onto the
  //                                unified UXA tracker.
  //   Pinterest Tag …………………………… s.pinimg.com (loader),
  //                                ct.pinterest.com (beacon)
  //   Reddit Pixel …………………………… www.redditstatic.com (loader),
  //                                events.redditmedia.com (beacon)
  //   X / Twitter Pixel ……………… static.ads-twitter.com (loader),
  //                                t.co, analytics.twitter.com (beacon)
  //   TikTok Pixel ……………………… analytics.tiktok.com (loader+beacon),
  //                                *.tiktokcdn.com
  //   Quora Pixel ………………………… a.quora.com (loader),
  //                                q.quora.com (beacon)
  //   Microsoft Bing UET ……… bat.bing.com (loader+beacon)
  //   Snap Pixel ……………………………… sc-static.net (loader),
  //                                tr.snapchat.com (beacon)
  //   PostHog ……………………………………… *.i.posthog.com, *-assets.i.posthog.com
  //   Cloudflare Web Analytics …  static.cloudflareinsights.com (loader),
  //                                cloudflareinsights.com (beacon)
  //   Adobe Launch ……………………… assets.adobedtm.com (loader),
  //                                *.adobedc.net, *.demdex.net (beacons,
  //                                AAM), *.omtrdc.net (analytics beacon)
  //   Razorpay checkout …………… checkout.razorpay.com, cdn.razorpay.com,
  //                                api.razorpay.com, lumberjack.razorpay.com
  const csp = [
    "default-src 'self'",
    [
      // Order matters for old-browser fallback: nonce first so it's the
      // primary trust anchor, then strict-dynamic (CSP3) so trusted scripts
      // can inject further scripts without rebuilding the allowlist on
      // every third-party CDN bump. 'unsafe-inline' + 'self' + the explicit
      // host allowlist below are the CSP2 fallback path (ignored by modern
      // browsers when nonce is present).
      `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' 'self'`,
      // GA + GTM
      'https://www.googletagmanager.com https://www.google-analytics.com',
      // Facebook
      'https://connect.facebook.net',
      // Firebase / Google sign-in
      'https://www.gstatic.com https://apis.google.com',
      // Cloudflare Turnstile + Cloudflare Insights
      'https://challenges.cloudflare.com https://static.cloudflareinsights.com',
      // Vercel live preview
      'https://vercel.live',
      // Razorpay
      'https://checkout.razorpay.com https://cdn.razorpay.com',
      // Microsoft Clarity — loader from www.clarity.ms, the actual
      // tag JS from scripts.clarity.ms, beacons via c.clarity.ms.
      // Wildcard covers all three plus future host changes.
      'https://*.clarity.ms',
      // LinkedIn Insight Tag
      'https://snap.licdn.com',
      // Contentsquare (Hotjar successor)
      'https://t.contentsquare.net',
      // Pinterest
      'https://s.pinimg.com',
      // Reddit
      'https://www.redditstatic.com',
      // X / Twitter
      'https://static.ads-twitter.com',
      // TikTok
      'https://analytics.tiktok.com',
      // Quora
      'https://a.quora.com',
      // Bing UET
      'https://bat.bing.com',
      // Snap
      'https://sc-static.net',
      // PostHog (cloud ingest + asset CDN). The single wildcard
      // matches both `us.i.posthog.com` and `us-assets.i.posthog.com`
      // (CSP host wildcards match any leftmost-label including
      // dashed ones). The previous `*-assets.i.posthog.com` entry
      // was invalid CSP syntax — wildcards can only be the leftmost
      // label, not part of one — and browsers ignored it entirely.
      'https://*.i.posthog.com',
      // Adobe Launch
      'https://assets.adobedtm.com',
      firebaseDbWildcard,
    ]
      .filter(Boolean)
      .join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live",
    [
      "img-src 'self' data: blob:",
      // Assets
      'https://res.cloudinary.com https://assets.hireadda.in https://lh3.googleusercontent.com',
      // Facebook beacons
      'https://www.facebook.com',
      // GA / GTM image beacons
      'https://www.google-analytics.com https://www.googletagmanager.com',
      // Vercel live
      'https://vercel.live https://vercel.com',
      // Razorpay
      'https://cdn.razorpay.com',
      // Microsoft Clarity beacons (wildcard covers all clarity.ms
      // hosts: www, c, scripts, plus telemetry to c.bing.com).
      'https://*.clarity.ms https://c.bing.com',
      // LinkedIn pixel beacon
      'https://px.ads.linkedin.com',
      // Contentsquare static assets / avatars
      'https://*.contentsquare.net',
      // Pinterest noscript pixel
      'https://ct.pinterest.com',
      // Reddit beacon (events.redditmedia.com is the trackEvent
      // endpoint; alb.reddit.com is the image-pixel beacon the
      // SDK loads on every track call — both are required).
      'https://events.redditmedia.com https://alb.reddit.com',
      // Twitter beacon
      'https://t.co https://analytics.twitter.com',
      // TikTok beacon
      'https://analytics.tiktok.com',
      // Quora noscript pixel
      'https://q.quora.com',
      // Bing UET image beacon
      'https://bat.bing.com',
      // Snap beacon
      'https://tr.snapchat.com',
      // PostHog static assets
      'https://*.i.posthog.com',
      // Adobe AAM
      'https://*.demdex.net https://*.everesttech.net https://*.omtrdc.net',
    ].join(' '),
    "font-src 'self' https://fonts.gstatic.com https://vercel.live",
    // Notification sounds (e.g. the WhatsApp inbox inbound beep) are short
    // base64 `data:` audio URIs; without an explicit media-src they fall back to
    // default-src 'self' and get blocked. blob: covers any object-URL media.
    "media-src 'self' data: blob:",
    [
      `connect-src 'self' ${apiUrl} ${wsUrl}`,
      // GA + GTM
      'https://www.google-analytics.com https://www.googletagmanager.com',
      // Facebook
      'https://connect.facebook.net https://www.facebook.com',
      // Turnstile + Cloudflare Insights
      'https://challenges.cloudflare.com https://cloudflareinsights.com',
      // Vercel
      'https://vercel.live',
      // Firebase
      'https://firebaseinstallations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firestore.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com',
      // Razorpay
      'https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com',
      // Microsoft Clarity telemetry (all *.clarity.ms hosts +
      // c.bing.com for the Bing-side fingerprint relay).
      'https://*.clarity.ms https://c.bing.com',
      // LinkedIn Insight (XHR)
      'https://px.ads.linkedin.com',
      // Contentsquare telemetry (XHR + WebSocket for live replays).
      // The verify-installation auto-check pings
      // tcvsapi.contentsquare.com which is on the .com TLD, NOT
      // .net — both apexes must be allowed.
      'https://*.contentsquare.net wss://*.contentsquare.net https://*.contentsquare.com',
      // Pinterest
      'https://ct.pinterest.com',
      // Reddit (pixel-config XHR fetches conversion-event config
      // before each track call; events beacon takes the actual hit).
      'https://events.redditmedia.com https://pixel-config.reddit.com',
      // Twitter
      'https://analytics.twitter.com https://t.co',
      // TikTok
      'https://analytics.tiktok.com https://*.tiktok.com',
      // Quora
      'https://q.quora.com https://a.quora.com',
      // Bing UET
      'https://bat.bing.com',
      // Snap
      'https://tr.snapchat.com',
      // PostHog ingestion
      'https://*.i.posthog.com',
      // Adobe Analytics + AAM
      'https://*.adobedc.net https://*.demdex.net https://*.omtrdc.net https://*.everesttech.net',
      firebaseDbWildcard,
    ]
      .filter(Boolean)
      .join(' '),
    // `blob:` lets the candidate-onboarding + profile resume flows
    // render a just-picked PDF File via `URL.createObjectURL(file)` in
    // an inline <iframe>. Without it Chrome silently blocks the iframe
    // (you get the broken-PDF placeholder, no console error).
    // `https://assets.hireadda.in` is the R2 public bucket where
    // already-uploaded resumes live — same iframe preview, just from
    // the hosted URL instead of a blob.
    `frame-src 'self' blob: https://assets.hireadda.in https://www.googletagmanager.com https://challenges.cloudflare.com https://vercel.live https://*.firebaseapp.com https://api.razorpay.com https://checkout.razorpay.com https://*.contentsquare.net https://*.adobedc.net https://*.demdex.net${firebaseDbRegion ? ` https://*.${firebaseDbRegion}` : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${reportUri}`,
    'report-to csp-endpoint',
  ].join('; ');

  // Set request headers (readable by layout via headers())
  response.headers.set('x-nonce', nonce);

  // Set response headers (sent to client)
  response.headers.set('Content-Security-Policy', csp);
  // Reporting API v1 endpoint header (modern browsers use this instead of report-uri).
  //
  // All THREE groups are emitted, not just csp-endpoint. next.config.ts:73
  // declares `default`, `csp-endpoint` and `nel-endpoint`, but this runtime
  // `set()` replaces that header wholesale — so emitting only csp-endpoint
  // deleted the `default` group that the NEL header points at
  // (`{"report_to":"default"}`, next.config.ts:90). Network Error Logging then
  // had no v1 group to resolve and survived only via the legacy Report-To
  // header; browsers that have dropped Report-To lost NEL reports entirely.
  //
  // `reportUri` is the API origin (line 31), which is where CSP's own
  // `report-uri`/`report-to` already point — so this also removes the
  // origin mismatch with next.config.ts, which used the app origin.
  response.headers.set(
    'Reporting-Endpoints',
    `default="${reportUri}", csp-endpoint="${reportUri}", nel-endpoint="${reportUri}"`,
  );

  return response;
}
/**
 * Paths reachable without unlocking.
 *
 * The host application had a role-based routing table here: publicPaths,
 * guestOnlyPaths, authPaths, a rolePrefixMap and a JWT decoder that read the
 * role out of ha_access_token to pick a dashboard. None of that survives — there
 * is one password and one dashboard.
 */
const OPEN_PATHS = ['/unlock'];

/** Cookie set by /api/unlock. Its presence means unlocked. */
const UNLOCK_COOKIE = 'wa_unlock';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets, the BFF itself and the Meta webhook never gate. /api/unlock
  // must stay reachable while locked, or there would be no way to unlock.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return nextWithCsp();
  }

  const unlocked = Boolean(request.cookies.get(UNLOCK_COOKIE)?.value);

  // Already unlocked and sitting on /unlock — nothing to do here.
  if (unlocked && OPEN_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/whatsapp', request.url));
  }

  if (OPEN_PATHS.includes(pathname)) {
    return nextWithCsp();
  }

  // Everything else needs the cookie. The redirect carries the intended path so
  // unlocking lands where the operator was headed.
  //
  // NOTE: this is a convenience gate, not the security boundary. The cookie's
  // VALUE is never checked here — only its presence — because the middleware has
  // no way to verify an HMAC without the secret. Real enforcement is
  // requireAppPassword on the backend, which every API call passes through.
  if (!unlocked) {
    const url = new URL('/unlock', request.url);
    if (pathname !== '/') url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Root goes to the one dashboard there is.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/whatsapp', request.url));
  }

  return nextWithCsp();
}

export const config = {
  matcher: [
    // `monitoring` is the Sentry tunnelRoute (next.config.ts). It MUST be
    // excluded here — Sentry's docs warn that if the middleware matches the
    // tunnel route, client-side error reporting fails (the /monitoring 500s).
    '/((?!_next/static|_next/image|favicon.ico|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)',
  ],
};
