import { NextResponse } from 'next/server';
import { getTokensFromCookies } from '../_lib/proxy-helpers';

/**
 * GET /api/auth/session
 * Lightweight session check — returns whether auth cookies exist.
 */
export async function GET() {
  try {
    const { accessToken } = await getTokensFromCookies();
    return NextResponse.json({ isAuthenticated: !!accessToken });
  } catch {
    return NextResponse.json({ isAuthenticated: false });
  }
}
