import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, setAuthCookies } from '../_lib/proxy-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await backendFetch('/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify(body),
      request,
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // Strip tokens from response, set cookies
    const { accessToken, refreshToken, sessionId, ...safeData } = data.data || {};

    if (accessToken && refreshToken) {
      const response = NextResponse.json({ ...data, data: safeData });
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
