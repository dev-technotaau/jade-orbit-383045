import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '../_lib/proxy-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await backendFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
      request,
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
