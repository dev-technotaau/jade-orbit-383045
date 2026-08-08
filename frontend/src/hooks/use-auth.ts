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

  /** Submit the app password. Resolves true when the backend accepts it. */
  const login = useCallback(
    async (password: string): Promise<boolean> => {
      const ok = await unlockService.unlock(password);
      if (ok) setUnlocked(OPERATOR);
      return ok;
    },
    [setUnlocked]
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
    register,
    logout,
    redirectToDashboard,
  };
}

export default useAuth;
