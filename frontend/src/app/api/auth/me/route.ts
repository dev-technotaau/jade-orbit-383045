import { NextRequest, NextResponse } from 'next/server';
import {
  authenticatedBackendFetch,
  setAuthCookies,
  clearAuthCookies,
  getTokensFromCookies,
} from '../_lib/proxy-helpers';
import { attemptServerRefresh } from '../_lib/refresh';

export async function GET(request: NextRequest) {
  try {
    let res = await authenticatedBackendFetch('/auth/me', { request });

    // If 401, try silent refresh then retry
    if (res.status === 401) {
      const tokens = await attemptServerRefresh();
      if (tokens) {
        // Retry with new access token
        res = await authenticatedBackendFetch('/auth/me', {
          request,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        // Always persist refreshed tokens regardless of retry result.
        // The old refresh token was revoked during rotation — losing the
        // new tokens permanently locks the user out on the next request.
        const { rememberMe } = await getTokensFromCookies();

        if (res.ok) {
          const data = await res.json();
          const response = NextResponse.json(data);
          return setAuthCookies(response, tokens.accessToken, tokens.refreshToken, rememberMe);
        }

        // Retry failed but tokens are still valid — preserve them so the
        // next request can succeed (e.g. after lastActiveAt propagates).
        const errorData = await res
          .json()
          .catch(() => ({ status: 'error', message: 'Not authenticated' }));
        const response = NextResponse.json(errorData, { status: res.status });
        return setAuthCookies(response, tokens.accessToken, tokens.refreshToken, rememberMe);
      }

      // Refresh itself failed (no valid refresh token) — session is truly dead.
      const response = NextResponse.json(
        { status: 'error', message: 'Not authenticated' },
        { status: 401 },
      );
      return clearAuthCookies(response);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
