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
 * - require-trusted-types-for is intentionally NOT enabled: parts of React/Next.js
 *   still write to DOM sinks without TT policies. Rolling this out safely needs a
 *   long report-only observation period first. (With every third-party analytics
 *   and payment script now gone, this is closer to viable than it was.)
 */
function nextWithCsp(): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();

  const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

  // CSP / NEL reports go to THIS app's own collector
  // (src/app/api/csp-report/route.ts, which logs them). Same-origin,
  // so no cross-origin delivery to worry about, and it matches the
  // Reporting-Endpoints header built in next.config.ts.
  const reportUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/csp-report`;

  // Derive WebSocket URL from API URL (http→ws, https→wss)
  const wsUrl = apiUrl.replace(/^http/, 'ws');

  const originOf = (raw: string | undefined): string => {
    try {
      return raw ? new URL(raw).origin : '';
    } catch {
      return '';
    }
  };

  // Where large attachments are PUT directly, bypassing the BFF proxy's body
  // limit. This has to be in connect-src or the browser blocks the upload before
  // it is sent — and the send then fails for exactly the files that cannot go
  // any other way.
  const r2UploadOrigin = originOf(process.env.NEXT_PUBLIC_R2_UPLOAD_ORIGIN);

  // The host platform listed ~15 analytics and advertising providers here —
  // GA/GTM, Facebook, Clarity, LinkedIn, Contentsquare, Pinterest, Reddit,
  // X, TikTok, Quora, Bing UET, Snap, PostHog, Adobe, Razorpay. Every loader
  // component was removed with the marketing site, so the allowlist granted
  // script and connect access to hosts nothing contacts. What remains is what
  // this module actually talks to.
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
      // Turnstile loader. Modern browsers ignore this (strict-dynamic wins);
      // it is the CSP2 fallback for browsers without strict-dynamic support.
      'https://challenges.cloudflare.com',
      // Vercel live preview
      'https://vercel.live',
    ]
      .filter(Boolean)
      .join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live",
    [
      // WhatsApp media is streamed through the backend on this origin, so
      // 'self' covers it. The storage bucket itself is NOT listed: it used to be
      // (via NEXT_PUBLIC_R2_PUBLIC_URL, an anonymous `*.r2.dev` domain), which
      // sanctioned loading archived customer attachments straight from public
      // storage instead of through the authenticated proxy.
      "img-src 'self' data: blob:",
      // Vercel live preview
      'https://vercel.live https://vercel.com',
    ]
      .filter(Boolean)
      .join(' '),
    "font-src 'self' https://fonts.gstatic.com https://vercel.live",
    // Notification sounds (e.g. the WhatsApp inbox inbound beep) are short
    // base64 `data:` audio URIs; without an explicit media-src they fall back to
    // default-src 'self' and get blocked. blob: covers any object-URL media.
    "media-src 'self' data: blob:",
    [
      `connect-src 'self' ${apiUrl} ${wsUrl}`,
      // Direct-to-storage attachment uploads (signed PUT).
      r2UploadOrigin,
      // Vercel
      'https://vercel.live',
    ]
      .filter(Boolean)
      .join(' '),
    // `blob:` lets the inbox preview a just-picked PDF via
    // `URL.createObjectURL(file)` in an inline <iframe>. Without it Chrome
    // silently blocks the iframe (broken-PDF placeholder, no console error).
    // challenges.cloudflare.com is where Turnstile renders its challenge
    // iframe. Without it the widget is blocked outright, and because Turnstile
    // is required in production (env.ts superRefine) that means nobody can
    // unlock. The blocked frame also gets a null origin, so its postMessage
    // handshake back to the page fails — that is the 'target origin ... does
    // not match the recipient window (null)' noise, not a separate bug.
    "frame-src 'self' blob: https://challenges.cloudflare.com https://vercel.live",
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
  // `reportUri` is this app's own origin, matching both CSP's `report-uri`
  // above and the Reporting-Endpoints header in next.config.ts.
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
/**
 * /offline is public because the service worker pre-caches it as the
 * navigation fallback. Gated, it 307s to /unlock while locked, and the worker
 * would cache a redirect — which cannot then be served for a navigation.
 * It renders no data, so there is nothing behind it to protect.
 */
const OPEN_PATHS = ['/unlock', '/offline'];

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
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)',
  ],
};
