/**
 * /api/indexnow-ping — proxy that fans a URL list to all IndexNow
 * endpoints (Bing, Yandex, etc.).
 *
 * Auth model:
 *   - Local CI / deploy scripts hit this with a shared `Authorization:
 *     Bearer <INDEXNOW_PING_TOKEN>` header.
 *   - Backend services hit this with the same shared token (set in their
 *     env via Bitnami SealedSecrets).
 *   - Public callers are rejected — leaking access lets attackers spam
 *     IndexNow on our behalf, which (while non-destructive) wastes our
 *     per-host quota and could trigger search-engine rate limits.
 *
 * Body: `{ "urls": ["https://hireadda.in/jobs/foo", …] }`
 *   - 1–10,000 URLs per call. Anything over 10k is sliced server-side.
 *   - URLs must share the same host (api.indexnow.org rejects mixed hosts).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { canonicaliseForIndexNow, pingIndexNow } from '@/lib/indexnow';

const TOKEN = process.env.INDEXNOW_PING_TOKEN;

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    // Token not configured — allow only in non-production environments
    // so dev workflows don't break, but lock down prod.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'IndexNow ping disabled (INDEXNOW_PING_TOKEN unset)' },
        { status: 503 },
      );
    }
  } else {
    const auth = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${TOKEN}`;
    if (auth !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrls =
    body && typeof body === 'object' && Array.isArray((body as { urls?: unknown }).urls)
      ? ((body as { urls: unknown[] }).urls as unknown[])
      : null;

  if (!rawUrls || rawUrls.length === 0) {
    return NextResponse.json({ error: '`urls` must be a non-empty array' }, { status: 400 });
  }

  const urls = rawUrls
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map(canonicaliseForIndexNow);

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No valid URLs after canonicalisation' }, { status: 400 });
  }

  const results = await pingIndexNow(urls);
  const okCount = results.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: okCount > 0,
    submitted: urls.length,
    endpointResults: results,
  });
}

// Force the route to run on Node.js runtime (AbortSignal.timeout etc.).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
