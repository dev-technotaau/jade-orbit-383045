import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, authenticatedBackendFetch, setAuthCookies } from '../../_lib/proxy-helpers';

/** Routes that return tokens and need cookie interception */
const TOKEN_ROUTES = new Set(['login/verify']);

async function handler(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const subPath = path.join('/');
    const backendPath = `/webauthn/${subPath}`;
    const isTokenRoute = TOKEN_ROUTES.has(subPath);

    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = JSON.stringify(await request.json());
    }

    // login/options and login/verify are public (no auth needed)
    // register/* routes need auth
    const needsAuth = subPath.startsWith('register') || subPath.startsWith('credentials');

    const res = needsAuth
      ? await authenticatedBackendFetch(backendPath, { method: request.method, body, request })
      : await backendFetch(backendPath, { method: request.method, body, request });

    const data = await res.json();

    if (!res.ok || !isTokenRoute) {
      return NextResponse.json(data, { status: res.status });
    }

    // Token route — strip tokens, set cookies
    const { accessToken, refreshToken, ...safeData } = data.data || {};

    if (accessToken && refreshToken) {
      const response = NextResponse.json({ ...data, data: safeData });
      return setAuthCookies(response, accessToken, refreshToken);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
