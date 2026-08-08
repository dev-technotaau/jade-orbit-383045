import { NextRequest, NextResponse } from 'next/server';
import { authenticatedBackendFetch } from '../../_lib/proxy-helpers';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await authenticatedBackendFetch('/auth/me/profile', {
      request,
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
