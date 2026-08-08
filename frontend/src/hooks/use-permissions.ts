'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminPermissionService } from '@/services/admin-permission.service';
import { useAuthStore } from '@/store/auth.store';
import { useSocket } from '@/hooks/use-socket';
import { resolvePermission } from '@/types/permissions';
import type { EffectivePermissions } from '@/types/permissions';

export const PERMISSIONS_QUERY_KEY = ['admin', 'me', 'permissions'] as const;

/**
 * The caller's effective admin permissions.
 *
 * ── Fail-closed while loading ──────────────────────────────────────────
 * `can()` returns FALSE until the grant list has actually arrived. The
 * tempting alternative — treat "still loading" as permissive so the nav
 * doesn't flicker — means every admin briefly sees the full super-admin
 * sidebar on each page load, which looks like a security bug even though
 * the API would refuse the clicks. `isLoading` is exposed so callers can
 * render a skeleton instead of a wrongly-empty UI.
 *
 * SUPER_ADMIN short-circuits to true everywhere without waiting on the
 * request, because their access is unconditional by role.
 *
 * ── Live invalidation ──────────────────────────────────────────────────
 * When a super-admin changes someone's grants the server emits
 * `admin:permissions-changed` to that user's room, so an admin's UI
 * re-gates within a second rather than after the 5-minute cache expiry.
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data, isLoading, isError } = useQuery<EffectivePermissions>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: () => adminPermissionService.getMyPermissions(),
    enabled: isAdmin,
    // Grants change rarely and the socket handles the urgent case, so a
    // long stale time keeps this off the critical path of every navigation.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (!socket || !isAdmin) return;
    const onChange = () => {
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_QUERY_KEY });
    };
    socket.on('admin:permissions-changed', onChange);
    return () => {
      socket.off('admin:permissions-changed', onChange);
    };
  }, [socket, isAdmin, queryClient]);

  const grants = useMemo(() => data?.grants ?? [], [data]);

  const can = useCallback(
    (permissionKey: string): boolean => {
      if (isSuperAdmin) return true;
      if (!isAdmin) return false;
      // Fail closed: no data yet means no permission yet.
      if (!data) return false;
      return resolvePermission(grants, permissionKey);
    },
    [isSuperAdmin, isAdmin, data, grants],
  );

  const canAny = useCallback((...keys: string[]): boolean => keys.some((k) => can(k)), [can]);

  const canAll = useCallback((...keys: string[]): boolean => keys.every((k) => can(k)), [can]);

  return {
    can,
    canAny,
    canAll,
    /** Flat allow-set, expanded to leaves. */
    allowed: data?.allowed ?? [],
    grants,
    roles: data?.roles ?? [],
    isSuperAdmin,
    isAdmin,
    /**
     * True until grants are known. Callers that would otherwise render an
     * empty nav should show a skeleton while this is set.
     */
    isLoading: isAdmin && !isSuperAdmin && isLoading,
    isError,
  };
}
