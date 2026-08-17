import { createHmac } from 'crypto';
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

/**
 * A stable per-browser id for the backend's rate limiters.
 *
 * Everything the console does arrives at the API from this one server, so
 * `req.ip` there is our egress address and every operator shared a single
 * rate-limit and DDoS bucket: one person with several inbox tabs open could
 * trip the per-second threshold and 429 the whole team for a minute. The
 * backend keys on this header instead when it is present (and only when the
 * BFF secret alongside it checks out, since a browser could otherwise mint one
 * per request).
 *
 * It is an HMAC of the session token rather than the token itself — the value
 * ends up in Redis keys and log lines, and a session credential has no business
 * being in either. Truncated because it only has to be unique among a handful
 * of operators.
 */
function operatorKey(unlockToken: string, secret: string): string {
  return createHmac('sha256', secret).update(unlockToken).digest('hex').slice(0, 32);
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // No traversal. The `/health` prefix check below routes to a different backend
  // base, and segments are joined verbatim — so `..` segments could walk out of
  // the intended root. Reject them before anything is built.
  if (path.some((seg) => seg === '..' || seg === '.' || seg.includes('..'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const backendPath = `/${path.join('/')}`;
  const searchParams = request.nextUrl.searchParams.toString();
  // Health endpoints live at the root, not under /api/v1.
  const baseUrl = backendPath.startsWith('/health')
    ? BACKEND_URL.replace(/\/api\/v\d+$/, '')
    : BACKEND_URL;
  const url = `${baseUrl}${backendPath}${searchParams ? `?${searchParams}` : ''}`;

  const cookieStore = await cookies();
  const unlockToken = cookieStore.get(UNLOCK_COOKIE)?.value;

  // Locked means locked. This forwarded upstream regardless, which made the
  // public deployment URL a door: anyone could call /api/proxy/... and reach the
  // backend without a credential. It only ever failed because the BACKEND then
  // rejected it — and the BFF secret this route attaches is precisely what
  // bypasses CSRF there, so the door was being held open with a key in it.
  // `src/proxy.ts` cannot cover this: it returns early for every /api/ path.
  if (!unlockToken) {
    return NextResponse.json({ error: 'Locked' }, { status: 401 });
  }

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  // The backend's requireAppPassword accepts this cookie by name.
  headers.set('cookie', `${UNLOCK_COOKIE}=${unlockToken}`);
  if (BFF_SECRET) {
    headers.set('x-bff-secret', BFF_SECRET);
    // Only meaningful next to the secret above: the backend ignores an operator
    // key it cannot attribute to this proxy.
    headers.set('x-operator-key', operatorKey(unlockToken, BFF_SECRET));
  }

  // Client context the backend's rate limiters and logs use.
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  if (forwarded) headers.set('x-forwarded-for', forwarded);
  const ua = request.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  // Custom headers the backend's middleware reads. Without explicit forwarding
  // the proxy drops them silently and the backend rejects with errors that look
  // like client bugs.
  //   - Idempotency-Key      — requireIdempotencyKey() → 400 if absent
  //   - x-csrf-token          — CSRF middleware (bypassed via x-bff-secret,
  //                             forwarded anyway for defence in depth)
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const csrfToken = request.headers.get('x-csrf-token');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);

  // Range — the media proxy answers 206 partials so <video>/<audio> can seek.
  // Dropped here, the backend never sees the range, always replies 200, and
  // every scrubber drag became a fresh download of the whole file.
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

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
      { status: 502 },
    );
  }

  // Stream the response through untouched — including binary media, which the
  // WhatsApp inbox fetches for attachments.
  const outHeaders = new Headers();
  // content-length is NOT unconditionally forwarded. undici transparently
  // decompresses gzip/br, but leaves the upstream content-length — the
  // COMPRESSED size — in res.headers. Forwarding it hands the browser a byte
  // count that does not describe the body it is about to receive:
  //   header < actual -> the response is truncated mid-JSON and parsing fails
  //   header > actual -> the browser waits for bytes that never arrive, and
  //                      the request hangs until the client timeout
  // Measured against the deployed API: /mfa/status announced 139 bytes and
  // delivered 182; /keyword-rules announced 30 and delivered 26. Both failed,
  // in opposite ways, while the backend logged a clean 200.
  //
  // It is still forwarded when nothing was decoded, so binary media (already
  // compressed, so the compressor skips it) keeps a real length for progress
  // reporting. Omitted, the response is simply chunked and read to end-of-stream.
  const wasDecoded = res.headers.has('content-encoding');
  // accept-ranges/content-range must survive the hop or the browser cannot tell
  // that a 206 is a slice of something larger, and refuses to seek.
  const passthrough = [
    'content-type',
    'content-disposition',
    'cache-control',
    'accept-ranges',
    'content-range',
  ];
  if (!wasDecoded) passthrough.push('content-length');
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

/**
 * Media is proxied through this handler, so it has to outlive a JSON round-trip.
 * Vercel's default ceiling is ~10s: long enough for an API call, but an inbox
 * attachment (100 MB cap) or a video being seeked through is still on the wire
 * when the function is killed, and the operator sees playback stop partway with
 * a clean 200 in the log. 60s is the maximum every plan allows.
 */
export const maxDuration = 60;
