'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import { broadcastLogin } from '@/lib/auth-channel';
import { getQueryClient } from '@/lib/query-client';
import { showToast } from '@/components/ui/Toast';
import { ROLE_DASHBOARDS } from '@/constants/routes';
import type { Role } from '@/types/auth';

/**
 * OAuth callback page.
 * After social login (Google/LinkedIn), the backend redirects here with
 * tokens in the URL hash fragment (never sent to servers or logged).
 * This page:
 *   1. Reads tokens from the hash
 *   2. Calls /api/auth/migrate to set first-party httpOnly cookies
 *   3. Fetches the user profile via /api/auth/me
 *   4. Redirects to the appropriate dashboard
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const storeLogin = useAuthStore((s) => s.login);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    (async () => {
      try {
        // Read tokens from URL hash fragment
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        // Immediately clear the hash to remove tokens from the URL
        window.history.replaceState(null, '', window.location.pathname);

        if (!accessToken || !refreshToken) {
          showToast.error('Authentication failed. Please try again.');
          router.push('/auth/login');
          return;
        }

        // Migrate tokens to httpOnly cookies via the BFF endpoint
        await fetch('/api/auth/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ accessToken, refreshToken }),
        });

        // Fetch user profile (now using httpOnly cookies)
        const meRes = await authService.getMe();
        const payload = meRes.data as unknown as Record<string, unknown>;
        const user = (payload?.user as typeof meRes.data) ?? meRes.data;

        getQueryClient().clear();
        storeLogin(user);
        broadcastLogin(user);

        showToast.success('Welcome!');
        const role = user.role as Role;
        router.push(ROLE_DASHBOARDS[role] || '/');
      } catch {
        showToast.error('Authentication failed. Please try again.');
        router.push('/auth/login');
      }
    })();
  }, [router, storeLogin]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--color-primary)]" />
        <p className="text-sm text-[var(--text-muted)]">Completing sign in...</p>
      </div>
    </div>
  );
}
