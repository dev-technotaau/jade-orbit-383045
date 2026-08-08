import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCookies, backendFetch, clearAuthCookies } from '../_lib/proxy-helpers';
import { clearRefreshCache } from '../_lib/refresh';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await getTokensFromCookies();

    // Clear cached refresh tokens so stale session can't be reused
    clearRefreshCache();

    // Tell backend to revoke the refresh token
    if (refreshToken) {
      await backendFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        request,
      }).catch(() => {}); // Don't block logout on backend failure
    }

    const response = NextResponse.json({
      status: 'success',
      message: 'Logged out successfully',
    });

    return clearAuthCookies(response);
  } catch {
    clearRefreshCache();
    // Always clear cookies even on error
    const response = NextResponse.json({
      status: 'success',
      message: 'Logged out successfully',
    });
    return clearAuthCookies(response);
  }
}
