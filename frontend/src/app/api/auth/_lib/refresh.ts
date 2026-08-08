import { cookies } from 'next/headers';
import { BACKEND_URL, BFF_SECRET, COOKIE_NAMES } from './config';

/** Mutex to prevent concurrent refresh calls from the proxy */
let refreshPromise: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

/**
 * TTL cache for the last successful refresh result.
 * After a token rotation the old refresh token is revoked. Requests that arrive
 * slightly later still carry the old (revoked) cookie, so without a cache they
 * would fail even though valid tokens were just issued seconds ago.
 */
let cachedTokens: { accessToken: string; refreshToken: string } | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 840_000; // 14 minutes (just under the 15min JWT expiry)

/**
 * Attempt a silent token refresh server-side.
 * Returns new tokens on success or null on failure.
 * Uses a mutex so concurrent 401 retries don't trigger multiple refreshes,
 * and a short TTL cache so sequential requests after rotation reuse the
 * fresh tokens instead of sending the revoked cookie to the backend.
 */
export async function attemptServerRefresh(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  // Return cached tokens if still fresh (prevents using revoked cookie)
  if (cachedTokens && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedTokens;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefresh()
    .then((tokens) => {
      if (tokens) {
        cachedTokens = tokens;
        cachedAt = Date.now();
      }
      return tokens;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Clear cached tokens (call on logout to prevent stale session reuse) */
export function clearRefreshCache() {
  cachedTokens = null;
  cachedAt = 0;
}

async function doRefresh(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIE_NAMES.REFRESH_TOKEN)?.value;

  if (!refreshToken) return null;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (BFF_SECRET) {
      headers['x-bff-secret'] = BFF_SECRET;
    }

    const res = await fetch(`${BACKEND_URL}/auth/refresh-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken = data?.data?.accessToken;
    const newRefreshToken = data?.data?.refreshToken;

    if (!newAccessToken || !newRefreshToken) return null;

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    return null;
  }
}
