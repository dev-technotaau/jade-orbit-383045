import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * BFF unlock / lock.
 *
 * POST   — verify the app password with the backend, then store the returned
 *          HMAC token in an httpOnly cookie.
 * DELETE — clear it (lock).
 *
 * Why go through the BFF at all: the token must land in an httpOnly cookie so
 * page JavaScript (and any XSS) cannot read it. Only a server route can set
 * that, which is exactly what the host application's BFF existed for — this
 * reuses the pattern, minus the 13 JWT routes.
 *
 * The password itself is never stored anywhere: it is forwarded once, exchanged
 * for an HMAC, and discarded.
 */

const COOKIE = 'wa_unlock';
const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://localhost:5000/api/v1';

/**
 * Absolute session lifetime, in seconds.
 *
 * This was a pure session cookie (no maxAge), which sounds safe but is not:
 * Chrome and Edge restore session cookies with "continue where you left off",
 * and the token itself carries no expiry, so a cookie that escaped stayed valid
 * until APP_PASSWORD was rotated for the whole team.
 *
 * Twelve hours covers a full shift, so nobody is logged out mid-conversation,
 * while still bounding how long a leaked cookie is useful. Deliberately
 * ABSOLUTE, not idle-based: a shared inbox has operators reading a long thread
 * without clicking, and an idle timeout would sign them out mid-reply.
 *
 * For instant revocation across all sessions, bump SESSION_EPOCH on the backend.
 */
const SESSION_MAX_AGE_SECONDS = (() => {
  const hours = Number(process.env.SESSION_MAX_AGE_HOURS);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 3600) : 12 * 3600;
})();

export async function POST(request: NextRequest) {
  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    // Forward the caller's address. Without it the backend sees this function's
    // egress IP for every unlock attempt in the world, so its per-IP brute-force
    // limiter treats the entire team as one bucket: 30 wrong guesses from
    // anywhere locks everyone out of the console. The generic proxy route has
    // always forwarded this; the unlock route — the one endpoint where it
    // actually protects a credential — did not.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    if (forwarded) headers['x-forwarded-for'] = forwarded;

    upstream = await fetch(`${BACKEND}/unlock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Cannot reach the API' }, { status: 502 });
  }

  if (!upstream.ok) {
    // Pass the upstream status through so the UI can tell "wrong password" (401)
    // from "server misconfigured" (500).
    const body = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: body?.error?.message ?? 'Unlock failed' },
      { status: upstream.status },
    );
  }

  const { data } = (await upstream.json()) as {
    data?: { token?: string; expiresInSeconds?: number };
  };
  if (!data?.token) {
    return NextResponse.json({ error: 'Malformed response from API' }, { status: 502 });
  }

  // Prefer the lifetime the BACKEND signed into the token. The token now carries
  // its own expiry and the server enforces it, so a cookie that outlived the
  // token would just produce confusing 401s on a session that looks live.
  const maxAge =
    typeof data.expiresInSeconds === 'number' && data.expiresInSeconds > 0
      ? data.expiresInSeconds
      : SESSION_MAX_AGE_SECONDS;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
