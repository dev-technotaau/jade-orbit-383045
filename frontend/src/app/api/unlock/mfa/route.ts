import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  MFA_PENDING_COOKIE,
  baseCookie,
  callBackend,
  completeSession,
} from '../../_lib/unlock-session';

/**
 * BFF step 2 — submit the second factor.
 *
 * The challenge ticket comes from the httpOnly `wa_mfa_pending` cookie, never
 * from the request body: page JavaScript has no way to read or forge it, so an
 * XSS on the unlock page cannot advance an authentication on its own.
 *
 * The host platform's equivalent has no ticket at all — it answers
 * `{requireMfa:true}` and expects the client to re-POST the entire email and
 * password alongside the code, putting the password on the wire twice per login.
 */
export async function POST(request: NextRequest) {
  let code: unknown;
  let trustDevice: unknown;
  try {
    ({ code, trustDevice } = (await request.json()) as {
      code?: unknown;
      trustDevice?: unknown;
    });
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (typeof code !== 'string' || code.trim().length === 0) {
    return NextResponse.json({ error: 'A code is required' }, { status: 400 });
  }

  const store = await cookies();
  const pendingToken = store.get(MFA_PENDING_COOKIE)?.value;
  if (!pendingToken) {
    return NextResponse.json(
      { error: 'This sign-in attempt expired. Enter the password again.' },
      { status: 401 },
    );
  }

  const result = await callBackend(
    '/unlock/mfa/verify',
    { pendingToken, code, trustDevice: trustDevice === true },
    request,
  );

  if (!result.ok) {
    const res = NextResponse.json({ error: result.message }, { status: result.status });
    // An expired or spent challenge is unrecoverable — drop the cookie so the
    // page falls back to the password step instead of retrying against a ticket
    // that can never work.
    if (result.status === 401 && /expired/i.test(result.message ?? '')) {
      res.cookies.set(MFA_PENDING_COOKIE, '', { ...baseCookie, maxAge: 0 });
    }
    return res;
  }

  const data = result.data ?? {};
  if (!data.token) {
    return NextResponse.json({ error: 'Malformed response from API' }, { status: 502 });
  }
  return completeSession(NextResponse.json({ ok: true, factor: data.factor }), data);
}
