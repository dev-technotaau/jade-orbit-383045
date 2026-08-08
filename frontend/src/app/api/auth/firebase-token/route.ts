import { NextRequest, NextResponse } from 'next/server';
import { authenticatedBackendFetch } from '../_lib/proxy-helpers';

/**
 * GET /api/auth/firebase-token
 * Proxies to backend GET /auth/firebase-token to get a Firebase custom token.
 * Used by the browser to sign into Firebase Auth for RTDB presence writes.
 */
export async function GET(request: NextRequest) {
  try {
    const res = await authenticatedBackendFetch('/auth/firebase-token', { request });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
