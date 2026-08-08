import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '../_lib/proxy-helpers';

/**
 * POST /api/auth/migrate
 * One-time migration: converts localStorage tokens into httpOnly cookies.
 * This endpoint will be removed after 2 weeks post-deployment.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, refreshToken, sessionId, rememberMe = true } = body;

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ status: 'error', message: 'Tokens required' }, { status: 400 });
    }

    const response = NextResponse.json({ status: 'success', message: 'Migrated to cookies' });
    return setAuthCookies(response, accessToken, refreshToken, rememberMe, sessionId);
  } catch {
    return NextResponse.json({ status: 'error', message: 'Migration failed' }, { status: 500 });
  }
}
