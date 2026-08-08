/**
 * BFF route handler for `DELETE /api/search-history/[id]`.
 *
 * Forwards the existing guest sessionId (if any) to the backend so it
 * can verify the row belongs to the caller before deletion. Never
 * mints a new session on DELETE — a delete the caller can't authorise
 * should be a no-op, not a side effect that issues a brand-new
 * tracking cookie.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticatedBackendFetch, errorResponse } from '@/app/api/auth/_lib/proxy-helpers';
import { GUEST_SESSION_HEADER, resolveGuestSession } from '../_lib/session';

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return errorResponse('Missing id', 400);

    const { sessionId } = resolveGuestSession(request, false);
    const upstream = await authenticatedBackendFetch(
      `/public/search-history/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        request,
        headers: sessionId ? { [GUEST_SESSION_HEADER]: sessionId } : {},
      },
    );

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[BFF] search-history delete failed', err);
    return errorResponse('Failed to delete search history entry', 502);
  }
}
