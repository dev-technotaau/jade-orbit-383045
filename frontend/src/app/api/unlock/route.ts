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
    upstream = await fetch(`${BACKEND}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      { status: upstream.status }
    );
  }

  const { data } = (await upstream.json()) as { data?: { token?: string } };
  if (!data?.token) {
    return NextResponse.json({ error: 'Malformed response from API' }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // No maxAge — a session cookie. Closing the browser re-locks the tool,
    // which is the safer default for something with a single shared password.
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
