/**
 * BFF route handler for `POST /api/search-history/migrate`.
 *
 * Called by the auth flow after a successful login to promote any
 * guest search history (sessionId-bound) onto the user's account
 * (userId-bound). On success, the BFF clears the `ha_search_session`
 * cookie so the user's next signed-out visit doesn't re-bind to a
 * stale empty session.
 *
 * Auth is required on the backend route. The forwarded request must
 * carry the access token via `authenticatedBackendFetch`, which adds
 * `Authorization: Bearer <ha_access_token>` from the BFF's cookie jar.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticatedBackendFetch, errorResponse } from '@/app/api/auth/_lib/proxy-helpers';
import {
  GUEST_SESSION_HEADER,
  clearGuestSessionCookie,
  resolveGuestSession,
} from '../_lib/session';

export async function POST(request: NextRequest) {
  try {
    // Read existing cookie only — migrate has nothing to mint, the
    // operation is meaningful only when a prior guest session exists.
    const { sessionId } = resolveGuestSession(request, false);

    // Body may carry an explicit sessionId override (e.g. when the
    // frontend wants to migrate a session it remembers). Pass through.
    const bodyText = await request.text();

    const upstream = await authenticatedBackendFetch('/public/search-history/migrate', {
      method: 'POST',
      request,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { [GUEST_SESSION_HEADER]: sessionId } : {}),
      },
      body: bodyText || '{}',
    });

    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });

    // Clear the cookie only on success — leave it intact on auth /
    // network failure so a retry can still find the same sessionId.
    if (upstream.ok) {
      clearGuestSessionCookie(response);
    }
    return response;
  } catch (err) {
    console.error('[BFF] search-history migrate failed', err);
    return errorResponse('Failed to migrate search history', 502);
  }
}
