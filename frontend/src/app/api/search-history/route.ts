/**
 * BFF route handlers for `/api/search-history`.
 *
 *   - GET  → list recent searches for the caller (authed user or guest).
 *   - POST → record a new search.
 *
 * Owns the `ha_search_session` cookie on the primary `hireadda.in`
 * domain. Mints a fresh sessionId on the first guest GET / POST and
 * forwards it to the backend as the `x-guest-session` header. The
 * backend never sees the cookie directly, so guest-session state is
 * entirely controlled by this BFF layer — same pattern as the
 * `ha_access_token` / `ha_refresh_token` cookies under `/api/auth/*`.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticatedBackendFetch, errorResponse } from '@/app/api/auth/_lib/proxy-helpers';
import {
  GUEST_SESSION_HEADER,
  attachGuestSessionCookie,
  resolveGuestSession,
} from './_lib/session';

const BACKEND_PATH = '/public/search-history';

export async function GET(request: NextRequest) {
  try {
    // Always mint for GET — first homepage hit needs a sessionId so the
    // user's subsequent search at /jobs records under the same owner.
    const { sessionId, minted } = resolveGuestSession(request, true);

    const search = request.nextUrl.search; // includes leading "?" or ""
    const upstream = await authenticatedBackendFetch(`${BACKEND_PATH}${search}`, {
      method: 'GET',
      request,
      headers: sessionId ? { [GUEST_SESSION_HEADER]: sessionId } : {},
    });

    const body = await upstream.text();
    const response = new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
    return attachGuestSessionCookie(response, sessionId, minted);
  } catch (err) {
    console.error('[BFF] search-history list failed', err);
    return errorResponse('Failed to list search history', 502);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Always mint for POST — recording without an owner is a no-op in
    // the backend service layer, which is why guest searches were
    // silently dropped before the BFF owned this cookie.
    const { sessionId, minted } = resolveGuestSession(request, true);
    const bodyText = await request.text();

    const upstream = await authenticatedBackendFetch(BACKEND_PATH, {
      method: 'POST',
      request,
      headers: sessionId ? { [GUEST_SESSION_HEADER]: sessionId } : {},
      body: bodyText,
    });

    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
    return attachGuestSessionCookie(response, sessionId, minted);
  } catch (err) {
    console.error('[BFF] search-history record failed', err);
    return errorResponse('Failed to record search', 502);
  }
}
