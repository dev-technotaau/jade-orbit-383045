import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL, BFF_SECRET, UNLOCK_COOKIE } from '../../_lib/config';

/**
 * Generic API proxy: /api/proxy/[...path]
 *
 * Forwards to the backend, attaching the app-password token from the httpOnly
 * unlock cookie. The browser never sees that value, which is the whole point of
 * routing through here rather than calling the API directly.
 *
 * ── What this used to do ──
 * It attached a JWT access token and, on a 401, silently refreshed via
 * `attemptServerRefresh()` and retried, rotating access/refresh/session/
 * remember-me cookies. There are no tokens to refresh now: the app password
 * either works or it does not. A 401 is passed straight through and the UI sends
 * the operator to /unlock.
 */

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/${path.join('/')}`;
  const searchParams = request.nextUrl.searchParams.toString();
  // Health endpoints live at the root, not under /api/v1.
  const baseUrl = backendPath.startsWith('/health')
    ? BACKEND_URL.replace(/\/api\/v\d+$/, '')
    : BACKEND_URL;
  const url = `${baseUrl}${backendPath}${searchParams ? `?${searchParams}` : ''}`;

  const cookieStore = await cookies();
  const unlockToken = cookieStore.get(UNLOCK_COOKIE)?.value;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  // The backend's requireAppPassword accepts this cookie by name.
  if (unlockToken) headers.set('cookie', `${UNLOCK_COOKIE}=${unlockToken}`);
  if (BFF_SECRET) headers.set('x-bff-secret', BFF_SECRET);

  // Client context the backend's rate limiters and logs use.
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  if (forwarded) headers.set('x-forwarded-for', forwarded);
  const ua = request.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  // Custom headers the backend's middleware reads. Without explicit forwarding
  // the proxy drops them silently and the backend rejects with errors that look
  // like client bugs.
  //   - Idempotency-Key      — requireIdempotencyKey() → 400 if absent
  //   - cf-turnstile-response — verifyTurnstile middleware
  //   - x-csrf-token          — CSRF middleware (bypassed via x-bff-secret,
  //                             forwarded anyway for defence in depth)
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const turnstile = request.headers.get('cf-turnstile-response');
  if (turnstile) headers.set('cf-turnstile-response', turnstile);
  const csrfToken = request.headers.get('x-csrf-token');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(url, { method: request.method, headers, body, cache: 'no-store' });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Cannot reach the API' } },
      { status: 502 }
    );
  }

  // Stream the response through untouched — including binary media, which the
  // WhatsApp inbox fetches for attachments.
  const outHeaders = new Headers();
  const passthrough = ['content-type', 'content-disposition', 'content-length', 'cache-control'];
  for (const h of passthrough) {
    const v = res.headers.get(h);
    if (v) outHeaders.set(h, v);
  }

  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
