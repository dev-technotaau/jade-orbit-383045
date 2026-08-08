'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import { ROUTES, ROLE_DASHBOARDS } from '@/constants/routes';
import { broadcastLogout, broadcastLogin } from '@/lib/auth-channel';
import { signOutFirebase } from '@/lib/firebase';
import type { LoginRequest, Role, User } from '@/types/auth';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    user,
    isAuthenticated,
    isLoading,
    isHydrated,
    lastLoginAt,
    login: storeLogin,
    logout: storeLogout,
    setUser,
    setLoading,
    hydrate,
  } = useAuthStore();

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  // Verify token on mount by fetching current user from BFF.
  // Skip if login just happened (within 60s) — token is guaranteed fresh.
  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      const freshLogin = lastLoginAt > 0 && Date.now() - lastLoginAt < 60_000;
      if (freshLogin) {
        setLoading(false);
        return;
      }
      authService
        .getMe()
        .then((res) => {
          const payload = res.data as unknown as Record<string, unknown>;
          const userData = (payload?.user ?? res.data) as User;
          setUser(userData);
        })
        .catch((err) => {
          // Only logout on 401 (invalid/expired token), not on network errors
          if (err?.statusCode === 401 || err?.response?.status === 401) {
            storeLogout();
          } else {
            setLoading(false);
          }
        })
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  const login = useCallback(
    async (data: LoginRequest, turnstileToken?: string) => {
      const res = await authService.login(data, turnstileToken);
      // Handle MFA requirement — backend returns requireMfa flag with no tokens
      if (res.data.requireMfa) {
        return res;
      }
      // Clear stale query cache from previous session before storing new user
      queryClient.clear();
      // Tokens are set as httpOnly cookies by the BFF — just store user
      storeLogin(res.data.user);
      broadcastLogin(res.data.user);
      return res;
    },
    [storeLogin, queryClient],
  );

  const register = useCallback(
    async (data: Parameters<typeof authService.register>[0], turnstileToken?: string) => {
      const res = await authService.register(data, turnstileToken);
      return res;
    },
    [],
  );

  const logout = useCallback(async () => {
    const isAdmin = user?.role && ADMIN_ROLES.includes(user.role as Role);
    try {
      await authService.logout();
    } catch {
      // Continue with local logout even if API fails
    }
    // Sign out of Firebase Auth (presence cleanup)
    signOutFirebase().catch(() => {});
    // Clear all cached query data to prevent stale data on next login
    queryClient.clear();
    storeLogout();
    broadcastLogout();
    router.push(isAdmin ? ROUTES.PORTAL.LOGIN : '/auth/login');
  }, [storeLogout, router, user, queryClient]);

  const redirectToDashboard = useCallback(() => {
    if (user?.role) {
      const dashboard = ROLE_DASHBOARDS[user.role as Role];
      router.push(dashboard);
    }
  }, [user, router]);

  return {
    user,
    isAuthenticated,
    isLoading: isLoading || !isHydrated,
    login,
    register,
    logout,
    redirectToDashboard,
  };
}
