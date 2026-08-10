import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { UNLOCK_COOKIE } from '../../_lib/config';

/**
 * Socket handshake credential.
 *
 * The unlock cookie is httpOnly, so browser JS cannot read it — but Socket.IO
 * needs to put a credential in `handshake.auth`. This route runs server-side,
 * reads the cookie, and hands the value back to the client, which forwards it
 * on connect. The backend accepts it in `io.use()` (see backend/src/socket.ts).
 *
 * Nothing new is exposed: the value is the same HMAC the cookie already holds,
 * not the app password. A locked visitor gets 401 and no socket.
 *
 * Without this route `fetchSocketToken()` in use-socket.ts always returned null
 * and the realtime inbox never connected.
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(UNLOCK_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Locked' }, { status: 401 });
  }

  return NextResponse.json(
    { socketToken: token },
    // Never cache a credential.
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
