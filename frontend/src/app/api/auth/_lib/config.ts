/**
 * BFF (Backend-For-Frontend) configuration.
 * These values are only available server-side in Next.js Route Handlers.
 */

/** Backend URL for server-side calls (never exposed to client) */
export const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000/api/v1';

/** Shared secret for CSRF bypass on server-to-server calls */
export const BFF_SECRET = process.env.BFF_SECRET || '';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'ha_access_token',
  REFRESH_TOKEN: 'ha_refresh_token',
  /** Non-httpOnly flag so client JS can detect auth state */
  AUTH_SESSION: 'ha_auth_session',
  REMEMBER_ME: 'ha_remember_me',
  /** Non-httpOnly session ID for "Current session" badge in UI */
  SESSION_ID: 'ha_session_id',
  /**
   * Guest search-history tracking sessionId. Minted by the BFF route
   * handlers under `/api/search-history/*` on the first guest call so
   * the chip carousel persists across page loads. Cleared by the
   * migrate route handler after a successful login-time promotion.
   * HttpOnly — opaque identifier, never read from client JS.
   */
  SEARCH_SESSION: 'ha_search_session',
} as const;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const daysToSeconds = (days: number) => days * 24 * 60 * 60;

/** Cookie maxAge in days — read from env, fallback to defaults */
const ACCESS_MAX_AGE_DAYS = parseInt(process.env.COOKIE_ACCESS_MAX_AGE_DAYS || '7', 10);
const REFRESH_MAX_AGE_DAYS = parseInt(process.env.COOKIE_REFRESH_MAX_AGE_DAYS || '30', 10);
// Guest search-history tracker. 180 days = long enough that returning
// guests still see their history a few months later; short enough that
// abandoned sessions naturally prune themselves. Independent of the
// auth cookie max-ages since this isn't an auth token.
const SEARCH_SESSION_MAX_AGE_DAYS = 180;

export function accessTokenCookieOptions(rememberMe = true) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax' as const,
    path: '/',
    ...(rememberMe ? { maxAge: daysToSeconds(ACCESS_MAX_AGE_DAYS) } : {}), // seconds (Next.js cookies API)
  };
}

export function refreshTokenCookieOptions(rememberMe = true) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax' as const,
    path: '/',
    ...(rememberMe ? { maxAge: daysToSeconds(REFRESH_MAX_AGE_DAYS) } : {}),
  };
}

export function sessionCookieOptions(rememberMe = true) {
  return {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: 'lax' as const,
    path: '/',
    // Persist as long as the REFRESH token (not the 7-day access window). These
    // cookies are the client's auth-state indicator (`ha_auth_session`) and the
    // remember-me flag — if they expire before the refresh token, an active
    // session silently downgrades: `rememberMe` reads false on the next refresh,
    // every auth cookie is re-issued WITHOUT maxAge (session cookie), and the
    // user is logged out the next time the browser closes. Keeping them aligned
    // with the refresh token (and re-armed on every refresh) prevents that.
    ...(rememberMe ? { maxAge: daysToSeconds(REFRESH_MAX_AGE_DAYS) } : {}),
  };
}

/**
 * Cookie options for the guest search-history sessionId.
 *
 * Treated like an auth refresh-token in terms of hardening (httpOnly,
 * SameSite=Lax, Secure-in-prod) even though the value is just an
 * opaque UUID — defence-in-depth, nothing readable by client JS.
 */
export function searchSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: daysToSeconds(SEARCH_SESSION_MAX_AGE_DAYS),
  };
}
