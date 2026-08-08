import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, setAuthCookies } from '../_lib/proxy-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rememberMe = true, ...rest } = body;

    const res = await backendFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      request,
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // MFA required — no tokens to set
    if (data.data?.requireMfa) {
      return NextResponse.json(data);
    }

    // Set httpOnly cookies, strip tokens from response
    const { accessToken, refreshToken, sessionId, ...safeData } = data.data || {};

    if (accessToken && refreshToken) {
      const response = NextResponse.json({
        ...data,
        data: safeData,
      });
      return setAuthCookies(response, accessToken, refreshToken, rememberMe, sessionId);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
