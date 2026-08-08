import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL, BFF_SECRET, COOKIE_NAMES } from '../../auth/_lib/config';
import {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  sessionCookieOptions,
} from '../../auth/_lib/config';
import { attemptServerRefresh } from '../../auth/_lib/refresh';

/**
 * Generic API proxy: /api/proxy/[...path]
 * Forwards all requests to the backend with the access token from httpOnly cookies.
 * Handles 401 with silent refresh + retry.
 */

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const backendPath = `/${path.join('/')}`;
  const searchParams = request.nextUrl.searchParams.toString();
  // Health endpoints live at root, not under /api/v1
  const baseUrl = backendPath.startsWith('/health')
    ? BACKEND_URL.replace(/\/api\/v\d+$/, '')
    : BACKEND_URL;
  const url = `${baseUrl}${backendPath}${searchParams ? `?${searchParams}` : ''}`;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_NAMES.ACCESS_TOKEN)?.value;
  const rememberMe = cookieStore.get(COOKIE_NAMES.REMEMBER_ME)?.value === '1';

  // Build headers
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (BFF_SECRET) headers.set('x-bff-secret', BFF_SECRET);

  // Forward client headers
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  if (forwarded) headers.set('x-forwarded-for', forwarded);
  const ua = request.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);
  const fingerprint = request.headers.get('x-device-fingerprint');
  if (fingerprint) headers.set('x-device-fingerprint', fingerprint);

  // App-specific custom headers the backend's middleware reads.
  // Without explicit forwarding the proxy silently drops them and the
  // backend rejects with "Missing/invalid X" errors that look like
  // client-side bugs:
  //   - Idempotency-Key — required by /billing/orders + /billing/quotes
  //     (backend `requireIdempotencyKey()` middleware → 400 IDEMPOTENCY_KEY_REQUIRED)
  //   - cf-turnstile-response — Turnstile CAPTCHA token used by
  //     /billing/quotes etc. (backend `verifyTurnstile` middleware)
  //   - x-csrf-token — backend CSRF middleware (currently bypassed
  //     for proxy calls via x-bff-secret, but forwarded for
  //     defence-in-depth if the bypass is ever scoped down)
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const turnstile = request.headers.get('cf-turnstile-response');
  if (turnstile) headers.set('cf-turnstile-response', turnstile);
  const csrfToken = request.headers.get('x-csrf-token');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);

  // Get request body
  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    // Network error (ECONNREFUSED/ECONNRESET during pod restart) — retry once after delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    res = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  }

  // On 401, attempt silent refresh then retry once. Note we do NOT gate on the
  // access token being present: after the 7-day access-cookie window lapses the
  // browser still holds a valid 30-day refresh cookie, and `attemptServerRefresh`
  // is a no-op (returns null) when there is no refresh token — so this is safe
  // for genuinely-anonymous calls while recovering sessions whose access cookie
  // has expired.
  if (res.status === 401) {
    const tokens = await attemptServerRefresh();
    if (tokens) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      res = await fetch(url, {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
      });

      // Always persist refreshed tokens in cookies, even if the retry failed.
      // The old refresh token was already revoked during rotation — if we don't
      // set the new cookies here, the browser keeps the revoked token and the
      // user is permanently locked out on the next request.
      const responseBody = await res.arrayBuffer();
      const response = new NextResponse(responseBody, {
        status: res.status,
        headers: {
          'content-type': res.headers.get('content-type') || 'application/json',
        },
      });

      response.cookies.set(
        COOKIE_NAMES.ACCESS_TOKEN,
        tokens.accessToken,
        accessTokenCookieOptions(rememberMe),
      );
      response.cookies.set(
        COOKIE_NAMES.REFRESH_TOKEN,
        tokens.refreshToken,
        refreshTokenCookieOptions(rememberMe),
      );
      response.cookies.set(COOKIE_NAMES.AUTH_SESSION, '1', sessionCookieOptions(rememberMe));
      // Re-arm the remember-me flag too (login sets it once; without this it
      // counts down from login and, on expiry, downgrades every auth cookie to
      // a session cookie → logout on the next browser close despite an active,
      // daily-used session). Slide it in lockstep with the tokens.
      response.cookies.set(
        COOKIE_NAMES.REMEMBER_ME,
        rememberMe ? '1' : '0',
        sessionCookieOptions(rememberMe),
      );

      return response;
    }

    // Refresh failed — DO NOT clear cookies here.
    // In serverless (Vercel), concurrent requests may race: one instance refreshes
    // successfully (setting new cookies) while another fails (token revoked by first).
    // If the failing instance clears cookies, it overwrites the successful one's
    // Set-Cookie headers, causing an unwanted logout.
    // Stale cookies are harmless: the middleware now allows login-page access with
    // expired tokens, and the client-side 401 handler triggers explicit logout.
  }

  // Stream the backend response through
  const responseBody = await res.arrayBuffer();
  const responseHeaders: Record<string, string> = {};

  // Forward safe response headers
  const ct = res.headers.get('content-type');
  if (ct) responseHeaders['content-type'] = ct;
  const requestId = res.headers.get('x-request-id');
  if (requestId) responseHeaders['x-request-id'] = requestId;
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) responseHeaders['retry-after'] = retryAfter;
  const cacheControl = res.headers.get('cache-control');
  if (cacheControl) responseHeaders['cache-control'] = cacheControl;

  return new NextResponse(responseBody, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
