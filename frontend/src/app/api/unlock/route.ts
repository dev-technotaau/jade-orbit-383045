import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  COOKIE,
  DEVICE_COOKIE,
  MFA_PENDING_COOKIE,
  baseCookie,
  callBackend,
  completeSession,
} from '../_lib/unlock-session';

/**
 * BFF unlock / lock.
 *
 * POST   — verify the app password and the bot challenge with the backend.
 *          Either completes the session, or opens an MFA challenge which
 *          `/api/unlock/mfa` finishes.
 * DELETE — clear the session (lock).
 *
 * Why go through the BFF at all: the token must land in an httpOnly cookie so
 * page JavaScript (and any XSS) cannot read it. Only a server route can set
 * that, which is exactly what the host application's BFF existed for — this
 * reuses the pattern, minus the 13 JWT routes.
 *
 * The password is never stored: it is forwarded once, exchanged, and discarded.
 */
export async function POST(request: NextRequest) {
  let password: unknown;
  let turnstileToken: unknown;
  try {
    ({ password, turnstileToken } = (await request.json()) as {
      password?: unknown;
      turnstileToken?: unknown;
    });
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  // A trusted browser skips the MFA prompt, so the backend needs to see the
  // device cookie on step 1.
  const store = await cookies();
  const device = store.get(DEVICE_COOKIE)?.value;

  const result = await callBackend(
    '/unlock',
    {
      password,
      // The backend's Turnstile middleware reads Cloudflare's conventional field.
      'cf-turnstile-response': typeof turnstileToken === 'string' ? turnstileToken : undefined,
    },
    request,
    device ? `${DEVICE_COOKIE}=${device}` : undefined,
  );

  if (!result.ok) {
    // Pass the upstream status through so the UI can tell "wrong password" (401)
    // from "failed the bot check" (400) from "server misconfigured" (500).
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const data = result.data ?? {};

  if (data.mfaRequired && data.pendingToken) {
    const res = NextResponse.json({ mfaRequired: true });
    res.cookies.set(MFA_PENDING_COOKIE, data.pendingToken, {
      ...baseCookie,
      maxAge: typeof data.expiresInSeconds === 'number' ? data.expiresInSeconds : 300,
    });
    return res;
  }

  if (!data.token) {
    return NextResponse.json({ error: 'Malformed response from API' }, { status: 502 });
  }
  return completeSession(NextResponse.json({ ok: true }), data);
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  // The device cookie deliberately SURVIVES a lock: "remember this browser" is
  // about the device, not the session, and clearing it would force a TOTP prompt
  // on every sign-in and make the option pointless.
  res.cookies.set(COOKIE, '', { ...baseCookie, maxAge: 0 });
  res.cookies.set(MFA_PENDING_COOKIE, '', { ...baseCookie, maxAge: 0 });
  return res;
}
