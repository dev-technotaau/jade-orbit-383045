import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, setAuthCookies } from '../_lib/proxy-helpers';

/**
 * POST /api/auth/verify-email
 * Proxies email verification to backend.
 * On success, sets httpOnly cookies and strips tokens from response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await backendFetch('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
      request,
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // Strip tokens from response and set httpOnly cookies
    const { accessToken, refreshToken, sessionId, ...safeData } = data.data || {};

    if (accessToken && refreshToken) {
      const response = NextResponse.json({
        ...data,
        data: safeData,
      });
      return setAuthCookies(response, accessToken, refreshToken, true, sessionId);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
