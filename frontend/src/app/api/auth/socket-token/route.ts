import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL, BFF_SECRET, UNLOCK_COOKIE } from '../../_lib/config';

/**
 * Socket handshake credential.
 *
 * Socket.IO needs a value in `handshake.auth`, and the unlock cookie is
 * httpOnly precisely so page JavaScript cannot hold one. This route used to
 * read the cookie and return its exact value — which is the full session
 * bearer credential: `requireAppPassword` accepts it on every HTTP route. The
 * httpOnly flag was, in practice, decorative.
 *
 * Now it exchanges the cookie for a short-lived, socket-scoped ticket minted by
 * the backend. The ticket opens a socket and nothing else; presenting it as a
 * session cookie gets a 401. It expires in ~2 minutes and `use-socket.ts`
 * refetches on reconnect.
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(UNLOCK_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Locked' }, { status: 401 });
  }

  const headers: Record<string, string> = { cookie: `${UNLOCK_COOKIE}=${token}` };
  if (BFF_SECRET) headers['x-bff-secret'] = BFF_SECRET;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/unlock/socket-ticket`, {
      headers,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Cannot reach the API' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Locked' }, { status: upstream.status });
  }

  const body = (await upstream.json().catch(() => ({}))) as {
    data?: { ticket?: string; expiresInSeconds?: number };
  };
  if (!body?.data?.ticket) {
    return NextResponse.json({ error: 'Malformed response from API' }, { status: 502 });
  }

  return NextResponse.json(
    { socketToken: body.data.ticket, expiresInSeconds: body.data.expiresInSeconds },
    // Never cache a credential.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
