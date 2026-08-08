import { NextResponse } from 'next/server';
import { BACKEND_URL, BFF_SECRET } from '../auth/_lib/config';

/**
 * GET /api/csrf-token
 * Proxies the CSRF token request to the backend.
 * The backend CSRF endpoint lives at /api/csrf-token (outside /api/v1).
 */
export async function GET() {
  try {
    // BACKEND_URL includes /api/v1, so strip /v1 to reach /api/csrf-token
    const baseUrl = BACKEND_URL.replace(/\/v\d+$/, '');
    const url = `${baseUrl}/csrf-token`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (BFF_SECRET) {
      headers['x-bff-secret'] = BFF_SECRET;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch CSRF token' },
      { status: 500 },
    );
  }
}
