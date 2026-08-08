import { NextRequest, NextResponse } from 'next/server';
import {
  getTokensFromCookies,
  backendFetch,
  setAuthCookies,
  clearAuthCookies,
} from '../_lib/proxy-helpers';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken, rememberMe } = await getTokensFromCookies();

    if (!refreshToken) {
      return clearAuthCookies(
        NextResponse.json({ status: 'error', message: 'No refresh token' }, { status: 401 }),
      );
    }

    const res = await backendFetch('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      request,
    });

    const data = await res.json();

    if (!res.ok) {
      // Refresh failed — clear cookies
      return clearAuthCookies(NextResponse.json(data, { status: res.status }));
    }

    const newAccessToken = data.data?.accessToken;
    const newRefreshToken = data.data?.refreshToken;
    const sessionId = data.data?.sessionId;

    if (!newAccessToken || !newRefreshToken) {
      return clearAuthCookies(
        NextResponse.json(
          { status: 'error', message: 'Invalid refresh response' },
          { status: 500 },
        ),
      );
    }

    // Set rotated cookies, return success without tokens
    const response = NextResponse.json({ status: 'success' });
    return setAuthCookies(response, newAccessToken, newRefreshToken, rememberMe, sessionId);
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
