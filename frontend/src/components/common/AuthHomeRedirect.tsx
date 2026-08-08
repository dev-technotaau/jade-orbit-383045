'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import type { User } from '@/types/auth';

const ROLE_DASHBOARDS: Record<string, string> = {
  CANDIDATE: '/candidate',
  EMPLOYER: '/employer',
  ADMIN: '/admin',
  SUPER_ADMIN: '/super-admin',
};

/**
 * Client-side redirect for authenticated users landing on the public home page.
 * Covers edge cases where the browser serves a cached page (bypassing middleware).
 *
 * Bypass: `?stayhome=1` opts out of the redirect (used by the dashboard
 * account dropdown's "Visit Homepage" entry — see DashboardHeader and
 * proxy.ts for the matching middleware-level check). The flag is
 * stripped from the URL after first paint so it doesn't linger in the
 * address bar, get bookmarked, or get shared. The bypass is read from
 * the live `window.location.search` (not Next's `useSearchParams`) so
 * we don't subscribe the component to re-render on every query change.
 */
export default function AuthHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Honour the explicit-stay-on-homepage opt-out, then clean the
    // query param from the URL via history.replaceState so the user's
    // address bar reads "/" cleanly.
    const params = new URLSearchParams(window.location.search);
    if (params.get('stayhome') === '1') {
      params.delete('stayhome');
      const rest = params.toString();
      const cleanUrl = window.location.pathname + (rest ? `?${rest}` : '');
      window.history.replaceState(null, '', cleanUrl);
      return;
    }

    if (!document.cookie.includes('ha_auth_session=1')) return;
    const user = storage.get<User>(STORAGE_KEYS.USER);
    const dashboard = user?.role && ROLE_DASHBOARDS[user.role];
    if (dashboard) {
      router.replace(dashboard);
    }
  }, [router]);

  return null;
}
