import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Shared session-cookie plumbing for the unlock routes.
 *
 * Lives here rather than in a `route.ts` because Next.js type-checks route
 * files against a fixed set of allowed exports — anything beyond the HTTP verbs
 * and the recognised config keys fails the build.
 *
 * ── Three cookies, all httpOnly ──
 *  wa_unlock       the session. Lifetime is signed into the token itself.
 *  wa_mfa_pending  the half-authenticated MFA challenge ticket. 5 minutes.
 *  wa_device       "this browser is trusted", rotated on every use.
 *
 * The MFA challenge ticket could have been returned in a JSON body — it is
 * scoped and short-lived — but handing page JavaScript anything that advances
 * an authentication is how the host platform ended up with a 30-day MFA-bypass
 * token sitting in client state, reachable by any XSS.
 */

export const COOKIE = 'wa_unlock';
export const MFA_PENDING_COOKIE = 'wa_mfa_pending';
export const DEVICE_COOKIE = 'wa_device';

export const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://localhost:5000/api/v1';

/**
 * Absolute session lifetime, in seconds.
 *
 * The backend now signs an expiry into the token and enforces it, so this is
 * only the browser-side hint — kept in step via the `expiresInSeconds` the
 * backend returns. It matters because a pure session cookie (no maxAge) is
 * restored by Chrome and Edge under "continue where you left off".
 */
export const SESSION_MAX_AGE_SECONDS = (() => {
  const hours = Number(process.env.SESSION_MAX_AGE_HOURS);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 3600) : 12 * 3600;
})();

const secure = process.env.NODE_ENV === 'production';
export const baseCookie = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };

export interface BackendUnlock {
  token?: string;
  expiresInSeconds?: number;
  mfaRequired?: boolean;
  pendingToken?: string;
  factor?: string;
  trustedDevice?: { token: string; expiresAt: string };
}

/** Forward the caller's address so the backend's limiter buckets per client. */
export function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  if (forwarded) headers['x-forwarded-for'] = forwarded;
  return headers;
}

/** Apply a completed unlock to the response: session cookie + device cookie. */
export function completeSession(res: NextResponse, data: BackendUnlock): NextResponse {
  res.cookies.set(COOKIE, data.token as string, {
    ...baseCookie,
    maxAge:
      typeof data.expiresInSeconds === 'number' && data.expiresInSeconds > 0
        ? data.expiresInSeconds
        : SESSION_MAX_AGE_SECONDS,
  });
  // The challenge is over either way.
  res.cookies.set(MFA_PENDING_COOKIE, '', { ...baseCookie, maxAge: 0 });

  if (data.trustedDevice?.token) {
    const expires = new Date(data.trustedDevice.expiresAt);
    const maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000));
    res.cookies.set(DEVICE_COOKIE, data.trustedDevice.token, { ...baseCookie, maxAge });
  }
  return res;
}

/** POST to the backend's unlock tree and normalise the outcome. */
export async function callBackend(
  path: string,
  body: unknown,
  request: NextRequest,
  cookieHeader?: string,
): Promise<{ ok: boolean; status: number; data?: BackendUnlock; message?: string }> {
  const headers = forwardHeaders(request);
  if (cookieHeader) headers.cookie = cookieHeader;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 502, message: 'Cannot reach the API' };
  }

  const parsed = (await upstream.json().catch(() => ({}))) as {
    data?: BackendUnlock;
    error?: { message?: string };
    message?: string;
  };
  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      // BOTH shapes. The rate limiter answers `{ message }` at the top level
      // rather than under `error`, so its own explanation — "too many attempts,
      // try again in N minutes" — was discarded and every locked-out operator
      // saw the generic "Unlock failed" instead, which reads as a wrong
      // password and invites more attempts. Same fallback chain the axios
      // client uses.
      message: parsed?.error?.message ?? parsed?.message ?? 'Unlock failed',
    };
  }
  return { ok: true, status: 200, data: parsed.data };
}
