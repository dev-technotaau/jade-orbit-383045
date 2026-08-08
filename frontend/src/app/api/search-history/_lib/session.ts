/**
 * Shared helpers for the `/api/search-history/*` BFF routes.
 *
 * Owns the `ha_search_session` cookie lifecycle on the primary
 * `hireadda.in` domain, mirroring the pattern used for the auth
 * cookies in `app/api/auth/_lib/proxy-helpers.ts`. The backend never
 * touches this cookie — it only reads the sessionId that the BFF
 * forwards in the `x-guest-session` request header.
 */
import { randomUUID } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAMES, searchSessionCookieOptions } from '@/app/api/auth/_lib/config';

/** Header used to forward the resolved guest sessionId to the backend. */
export const GUEST_SESSION_HEADER = 'x-guest-session';

// Strict v4-UUID match — defends against truncated, padded, or
// injected cookie values being trusted as a sessionId.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read + validate the guest sessionId cookie. Returns undefined when missing or malformed. */
export function readGuestSession(request: NextRequest): string | undefined {
  const raw = request.cookies.get(COOKIE_NAMES.SEARCH_SESSION)?.value;
  if (!raw) return undefined;
  return UUID_V4_REGEX.test(raw) ? raw : undefined;
}

/**
 * Resolves the sessionId to forward to the backend. If the cookie is
 * missing or fails the format check AND `mintIfMissing` is true, a
 * fresh UUID is generated and the caller is expected to attach the
 * cookie to the outgoing response via `attachGuestSessionCookie`.
 *
 * `mintIfMissing` is true for GET /list + POST /record (where we want
 * the session to persist for future calls) and false for DELETE /:id
 * (where mint-on-delete would be an undesirable side-effect).
 */
export function resolveGuestSession(
  request: NextRequest,
  mintIfMissing: boolean,
): { sessionId: string | undefined; minted: boolean } {
  const existing = readGuestSession(request);
  if (existing) return { sessionId: existing, minted: false };
  if (!mintIfMissing) return { sessionId: undefined, minted: false };
  return { sessionId: randomUUID(), minted: true };
}

/** Attach the freshly-minted sessionId cookie to a response. No-op when not minted. */
export function attachGuestSessionCookie(
  response: NextResponse,
  sessionId: string | undefined,
  minted: boolean,
): NextResponse {
  if (!minted || !sessionId) return response;
  response.cookies.set(COOKIE_NAMES.SEARCH_SESSION, sessionId, searchSessionCookieOptions());
  return response;
}

/** Clear the guest sessionId cookie. Used after successful login-time migration. */
export function clearGuestSessionCookie(response: NextResponse): NextResponse {
  response.cookies.delete(COOKIE_NAMES.SEARCH_SESSION);
  return response;
}
