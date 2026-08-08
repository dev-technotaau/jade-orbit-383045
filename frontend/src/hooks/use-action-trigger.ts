'use client';

/**
 * use-action-trigger — companion hook to `use-auth-gate`.
 *
 * After a guest bounces through login from a gated CTA, they return to
 * the original URL with `?action=apply|save|contact|fetch_more|follow|
 * save_search|create_alert` appended. This hook fires the matching
 * effect on mount, then strips the param so it doesn't re-trigger
 * across re-renders or back-button navigations.
 *
 * Usage:
 *
 *   useActionTrigger('apply', () => openApplyModal());
 *   useActionTrigger('save', () => saveJobMutation.mutate());
 *
 * The hook compares the URL's `?action=` against `intent`. If matched,
 * `handler` runs once + the param is removed from the URL via
 * `router.replace`. The handler is given the auth-state snapshot at
 * trigger time so it can no-op gracefully if auth somehow rolled back.
 */

import { useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import type { AuthIntent } from '@/hooks/use-auth-gate';

interface Options {
  /**
   * Skip when the user isn't authenticated. Default: true. Most
   * post-auth actions only make sense for authed users; guests
   * shouldn't see action triggers fire.
   */
  authedOnly?: boolean;
}

export function useActionTrigger(
  intent: AuthIntent,
  handler: () => void,
  options: Options = {},
): void {
  const { authedOnly = true } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const handlerRef = useRef(handler);
  // eslint-disable-next-line react-hooks/refs
  handlerRef.current = handler;
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (authedOnly && !isAuthenticated) return;
    const action = searchParams?.get('action');
    if (action !== intent) return;

    firedRef.current = true;
    // Defer to the next tick so the host component has finished its
    // initial render — the handler may need to call a hook (e.g.
    // openModal) whose state hasn't been wired yet.
    queueMicrotask(() => {
      try {
        handlerRef.current();
      } catch {
        // Swallow handler errors; consumer's mutation will surface them.
      }
    });

    // Strip the action param so a re-render or back-button doesn't
    // re-trigger the handler. Keep all other params + the pathname.
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('action');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [authedOnly, intent, isAuthenticated, pathname, router, searchParams]);
}
