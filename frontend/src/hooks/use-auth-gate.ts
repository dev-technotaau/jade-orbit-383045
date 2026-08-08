'use client';

/**
 * Smart auth-gate hook for the public job + company surfaces.
 *
 * Every gated CTA on a public page (apply / save / contact / fetch-more
 * / follow / save-search / create-alert) calls `gatedAction(intent)`.
 * If the user is authenticated, the hook returns `false` (no gate
 * needed) and the caller proceeds. Otherwise the hook builds a
 * canonical redirect URL that points back to the current page with the
 * intent encoded, then navigates to login/register.
 *
 * After a successful login, the auth pages already honour `?redirect=`
 * (verified in the existing /auth/login + /auth/register code paths)
 * and bring the user back to the original URL. The destination page
 * reads the optional `?action=apply|save|...` param on mount and
 * triggers the matching modal/scroll/form.
 *
 * Filter-state preservation: by always serialising the current URL
 * (including search params) we guarantee guests land back on byte-
 * identical results post-auth. For URLs >2KB (rare) we fall back to
 * localStorage with a one-time-use key passed via `?restoreFilters=`.
 */

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/constants/routes';

/**
 * The user-intent that drives auto-action restoration after auth.
 * Each value corresponds to a `?action=...` param the destination
 * page consumes on mount.
 */
export type AuthIntent =
  | 'apply'
  | 'save'
  | 'contact'
  | 'fetch_more'
  | 'follow'
  | 'save_search'
  | 'create_alert';

const FILTER_OVERFLOW_KEY = 'ha_intent_filter_overflow';
const URL_LIMIT_BYTES = 1900;

/**
 * Persist a large filter blob in localStorage and return a one-time
 * key. Used when the encoded URL would exceed ~2KB (Express + most
 * proxies cap at 2-8KB). The destination page reads the key and
 * re-applies the blob to filter state on mount.
 */
function stashFilterOverflow(filters: Record<string, unknown>): string {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.localStorage.setItem(`${FILTER_OVERFLOW_KEY}:${key}`, JSON.stringify(filters));
  } catch {
    /* localStorage blocked — caller continues with truncated URL */
  }
  return key;
}

export function readFilterOverflow(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(`${FILTER_OVERFLOW_KEY}:${key}`);
    if (!raw) return null;
    window.localStorage.removeItem(`${FILTER_OVERFLOW_KEY}:${key}`);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface GateOptions {
  /**
   * Which auth surface to send the user to. Defaults to candidate
   * login — the right choice for job-board CTAs. Use `register-candidate`
   * to land on the signup page directly when intent is signup-y.
   */
  surface?:
    | 'login-candidate'
    | 'login-employer'
    | 'register-candidate'
    | 'register-employer'
    | 'chooser-login'
    | 'chooser-register';
  /**
   * Override the redirect-back URL. Default = current pathname + query.
   * Override only if the natural URL is wrong (e.g. clicking apply on a
   * card preview should redirect to the detail page, not the listing).
   */
  redirectTo?: string;
  /** Filter blob to restore post-auth when URL exceeds ~2KB. */
  filtersToRestore?: Record<string, unknown>;
}

const SURFACE_HREF: Record<NonNullable<GateOptions['surface']>, string> = {
  'login-candidate': ROUTES.AUTH.LOGIN_CANDIDATE,
  'login-employer': ROUTES.AUTH.LOGIN_EMPLOYER,
  'register-candidate': ROUTES.AUTH.REGISTER_CANDIDATE,
  'register-employer': ROUTES.AUTH.REGISTER_EMPLOYER,
  'chooser-login': ROUTES.AUTH.LOGIN,
  'chooser-register': ROUTES.AUTH.REGISTER,
};

export function useAuthGate() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /**
   * Test whether the current user can perform an `intent`. Returns
   * `false` if they're authenticated (proceed). Returns `true` after
   * triggering navigation to the auth surface (caller should bail).
   */
  const gatedAction = useCallback(
    (intent: AuthIntent, opts: GateOptions = {}): boolean => {
      if (isAuthenticated) return false; // No gate needed; caller proceeds.

      const surface = opts.surface ?? 'login-candidate';
      const surfaceHref = SURFACE_HREF[surface];

      // Build the redirect-back URL. Append the action param so the
      // destination page knows what modal/form to trigger on mount.
      const baseUrl = opts.redirectTo ?? pathname ?? '/';
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('action', intent);

      let redirectUrl = `${baseUrl}?${params.toString()}`;

      // Filter-overflow path — when the URL exceeds ~2KB we offload
      // the filter blob to localStorage and pass a key instead.
      if (opts.filtersToRestore && new TextEncoder().encode(redirectUrl).length > URL_LIMIT_BYTES) {
        const key = stashFilterOverflow(opts.filtersToRestore);
        const trimmed = new URLSearchParams();
        trimmed.set('action', intent);
        trimmed.set('restoreFilters', key);
        redirectUrl = `${baseUrl}?${trimmed.toString()}`;
      }

      const authUrl = `${surfaceHref}?redirect=${encodeURIComponent(redirectUrl)}`;
      router.push(authUrl);
      return true; // Caller should NOT proceed.
    },
    [isAuthenticated, pathname, searchParams, router],
  );

  return { isAuthenticated, gatedAction };
}
