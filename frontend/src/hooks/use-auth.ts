'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, OPERATOR } from '@/store/auth.store';
import { unlockService } from '@/services/unlock.service';

/**
 * Unlock hook.
 *
 * Replaces the host application's auth hook (login/register/social OAuth, JWT
 * refresh, role-based dashboard routing, cross-tab session broadcast). There are
 * no accounts — `login` here means "submit the app password".
 *
 * The return shape is unchanged so its ~14 consumers compile untouched:
 *  - `register` is retained and always rejects. There is no sign-up.
 *  - `redirectToDashboard` goes to the one dashboard that exists.
 */
export function useAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setUnlocked = useAuthStore((s) => s.login);
  const clear = useAuthStore((s) => s.logout);

  /**
   * Submit the app password.
   *
   * Resolves the step-1 outcome verbatim so the caller can render the MFA
   * challenge. The store is only marked unlocked once a session actually
   * exists — a password that merely opened an MFA challenge is NOT a session,
   * and treating it as one would let the UI navigate into the app on the
   * strength of one factor.
   */
  const login = useCallback(
    async (password: string, turnstileToken?: string | null) => {
      const result = await unlockService.unlock(password, turnstileToken);
      if (result.status === 'unlocked') setUnlocked(OPERATOR);
      return result;
    },
    [setUnlocked],
  );

  /** Submit the second factor and finish the sign-in. */
  const verifyMfa = useCallback(
    async (code: string, trustDevice = false) => {
      const result = await unlockService.verifyMfa(code, trustDevice);
      if (result.status === 'unlocked') setUnlocked(OPERATOR);
      return result;
    },
    [setUnlocked],
  );

  const logout = useCallback(async () => {
    await unlockService.lock().catch(() => {});
    clear();
    router.push('/unlock');
  }, [clear, router]);

  const register = useCallback(async (): Promise<never> => {
    throw new Error('This module has no accounts — there is nothing to register.');
  }, []);

  const redirectToDashboard = useCallback(() => {
    router.push('/whatsapp');
  }, [router]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    verifyMfa,
    register,
    logout,
    redirectToDashboard,
  };
}

export default useAuth;
