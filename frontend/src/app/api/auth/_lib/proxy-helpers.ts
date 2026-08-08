import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  BACKEND_URL,
  BFF_SECRET,
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  sessionCookieOptions,
} from './config';

// Hard timeout per attempt — undici's default headersTimeout is 5 min,
// which lets a stale socket hang the BFF route forever. 30 s is well
// above any legitimate backend latency (login peaks ~2 s under load)
// and surfaces failures fast so the retry path can kick in.
const BACKEND_FETCH_TIMEOUT_MS = 30_000;

// Error codes that indicate a transient connection-level fault — most
// commonly a stale keep-alive socket whose other end has gone away
// since the last use. One retry is enough to drop the dead socket and
// open a fresh one against the same nginx upstream.
const RETRYABLE_FETCH_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'UND_ERR_SOCKET',
]);

function isRetryableFetchError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; cause?: { code?: string; errors?: unknown[] } };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (e.code && RETRYABLE_FETCH_CODES.has(e.code)) return true;
  if (e.cause?.code && RETRYABLE_FETCH_CODES.has(e.cause.code)) return true;
  // undici surfaces multi-attempt failures as AggregateError under `cause`;
  // any of the inner errors matching is enough to retry.
  if (Array.isArray(e.cause?.errors)) {
    for (const inner of e.cause.errors) {
      const code = (inner as { code?: string })?.code;
      if (code && RETRYABLE_FETCH_CODES.has(code)) return true;
    }
  }
  return false;
}

/**
 * Wrapper around fetch that adds a hard timeout and one retry on
 * connection-level errors. Without this, a stale keep-alive socket in
 * the Node.js dispatcher pool can cause an indefinite hang or surface
 * as a 5xx to the browser after minutes — observed in prod when
 * upstream nginx state shifted under long-lived FE pods.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(BACKEND_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt === 0 && isRetryableFetchError(err)) {
        // Small backoff so we don't retry into the same flap immediately.
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw err;
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error('fetchWithRetry: exhausted attempts');
}

/**
 * Make an authenticated request to the backend, attaching the BFF secret
 * and forwarding relevant client headers.
 */
export async function backendFetch(
  path: string,
  init: RequestInit & { request?: NextRequest } = {},
): Promise<Response> {
  const { request, ...fetchInit } = init;
  const url = `${BACKEND_URL}${path}`;

  const headers = new Headers(fetchInit.headers);
  headers.set('Content-Type', 'application/json');

  // BFF secret bypasses CSRF on the backend
  if (BFF_SECRET) {
    headers.set('x-bff-secret', BFF_SECRET);
  }

  // Forward client info for device tracking / rate limiting
  if (request) {
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    if (forwarded) headers.set('x-forwarded-for', forwarded);

    const ua = request.headers.get('user-agent');
    if (ua) headers.set('user-agent', ua);

    const fingerprint = request.headers.get('x-device-fingerprint');
    if (fingerprint) headers.set('x-device-fingerprint', fingerprint);
  }

  return fetchWithRetry(url, {
    ...fetchInit,
    headers,
    cache: 'no-store',
  });
}

/**
 * Make an authenticated backend request using the access token from cookies.
 * Returns the raw Response.
 */
export async function authenticatedBackendFetch(
  path: string,
  init: RequestInit & { request?: NextRequest } = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_NAMES.ACCESS_TOKEN)?.value;

  const { request, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers);

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return backendFetch(path, { ...fetchInit, headers, request });
}

/**
 * Set auth cookies on a NextResponse.
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  rememberMe = true,
  sessionId?: string,
): NextResponse {
  response.cookies.set(
    COOKIE_NAMES.ACCESS_TOKEN,
    accessToken,
    accessTokenCookieOptions(rememberMe),
  );
  response.cookies.set(
    COOKIE_NAMES.REFRESH_TOKEN,
    refreshToken,
    refreshTokenCookieOptions(rememberMe),
  );
  response.cookies.set(COOKIE_NAMES.AUTH_SESSION, '1', sessionCookieOptions(rememberMe));
  response.cookies.set(
    COOKIE_NAMES.REMEMBER_ME,
    rememberMe ? '1' : '0',
    sessionCookieOptions(rememberMe),
  );
  if (sessionId) {
    response.cookies.set(COOKIE_NAMES.SESSION_ID, sessionId, sessionCookieOptions(rememberMe));
  }
  return response;
}

/**
 * Clear auth cookies on a NextResponse.
 */
export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(COOKIE_NAMES.ACCESS_TOKEN);
  response.cookies.delete(COOKIE_NAMES.REFRESH_TOKEN);
  response.cookies.delete(COOKIE_NAMES.AUTH_SESSION);
  response.cookies.delete(COOKIE_NAMES.REMEMBER_ME);
  response.cookies.delete(COOKIE_NAMES.SESSION_ID);
  return response;
}

/**
 * Read tokens from request cookies.
 */
export async function getTokensFromCookies() {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(COOKIE_NAMES.ACCESS_TOKEN)?.value || null,
    refreshToken: cookieStore.get(COOKIE_NAMES.REFRESH_TOKEN)?.value || null,
    rememberMe: cookieStore.get(COOKIE_NAMES.REMEMBER_ME)?.value === '1',
  };
}

/**
 * Create a JSON error response.
 */
export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ status: 'error', message }, { status });
}
