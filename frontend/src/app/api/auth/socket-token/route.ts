import { NextResponse } from 'next/server';
import { getTokensFromCookies } from '../_lib/proxy-helpers';

/**
 * GET /api/auth/socket-token
 * Returns the access token for Socket.IO initialization.
 * The token is held in memory briefly by the client for socket init only.
 */
export async function GET() {
  try {
    const { accessToken } = await getTokensFromCookies();

    if (!accessToken) {
      return NextResponse.json({ status: 'error', message: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({ socketToken: accessToken });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
