import type { Response } from 'express';
import { env } from '../config/env';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'ha_access_token',
  REFRESH_TOKEN: 'ha_refresh_token',
  /** Non-httpOnly flag so client JS can detect auth state */
  AUTH_SESSION: 'ha_auth_session',
  /** Non-httpOnly session ID for "Current session" badge in UI */
  SESSION_ID: 'ha_session_id',
} as const;

const isProduction = () => env.NODE_ENV === 'production';
const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;

export function getAccessTokenCookieOptions(rememberMe = true) {
  const maxAgeDays = parseInt(env.COOKIE_ACCESS_MAX_AGE_DAYS, 10) || 7;
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    ...(rememberMe ? { maxAge: daysToMs(maxAgeDays) } : {}),
    path: '/',
  };
}

export function getRefreshTokenCookieOptions(rememberMe = true) {
  const maxAgeDays = parseInt(env.COOKIE_REFRESH_MAX_AGE_DAYS, 10) || 30;
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    ...(rememberMe ? { maxAge: daysToMs(maxAgeDays) } : {}),
    path: '/',
  };
}

/**
 * Set httpOnly token cookies + a non-httpOnly session indicator.
 */
export function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  rememberMe = true,
  sessionId?: string
) {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions(rememberMe));
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, getRefreshTokenCookieOptions(rememberMe));
  const sessionMaxAgeDays = parseInt(env.COOKIE_ACCESS_MAX_AGE_DAYS, 10) || 7;
  const nonHttpOnlyOpts = {
    httpOnly: false,
    secure: isProduction(),
    sameSite: 'lax' as const,
    ...(rememberMe ? { maxAge: daysToMs(sessionMaxAgeDays) } : {}),
    path: '/',
  };
  res.cookie(COOKIE_NAMES.AUTH_SESSION, '1', nonHttpOnlyOpts);
  if (sessionId) {
    res.cookie(COOKIE_NAMES.SESSION_ID, sessionId, nonHttpOnlyOpts);
  }
}

/**
 * Clear all auth cookies.
 */
export function clearTokenCookies(res: Response) {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: '/' });
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: '/' });
  res.clearCookie(COOKIE_NAMES.AUTH_SESSION, { path: '/' });
  res.clearCookie(COOKIE_NAMES.SESSION_ID, { path: '/' });
}
