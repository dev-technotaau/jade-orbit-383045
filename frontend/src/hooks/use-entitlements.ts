'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entitlementService } from '@/services/entitlement.service';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import type { EntitlementSnapshot, ResourceUnit } from '@/types/entitlement';

const QUERY_KEY = ['billing', 'me', 'entitlements'];

/**
 * Single source of truth for the current user's entitlement snapshot.
 *
 *   const { snapshot, hasFeature, remaining, refetch, isLoading } = useEntitlements();
 *   if (!hasFeature('feature.cv_unlock')) return <UpgradePrompt />;
 *   if (remaining('CV_UNLOCK') === 0) return <UpgradePrompt />;
 *
 * Live updates: subscribes to `billing:entitlement:changed` Socket.IO
 * events emitted by `entitlement.service.consumeResource()` etc., and
 * invalidates the React Query cache so the UI updates within ~10ms.
 */
export function useEntitlements() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const query = useQuery<EntitlementSnapshot>({
    queryKey: QUERY_KEY,
    queryFn: () => entitlementService.getMine(),
    // Wait until useAuth has finished verifying the session
    // (`/api/auth/me`) before firing. Auth-gated queries that fire
    // optimistically off a cached `isAuthenticated=true` race the
    // verification call and trigger the BFF's refresh-token rotation
    // race across frontend pods. See auth.store.ts hydrate() comment.
    enabled: isAuthenticated && !authLoading,
    staleTime: 60_000, // 60s — most reads are cheap, real-time invalidation handles freshness
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    };
    socket.on('billing:entitlement:changed', handler);
    return () => {
      socket.off('billing:entitlement:changed', handler);
    };
  }, [socket, queryClient]);

  const snapshot = query.data;
  const hasFeature = (key: string): boolean => Boolean(snapshot?.features?.[key]);
  const remaining = (unit: ResourceUnit): number =>
    snapshot?.resources?.[unit]?.totalRemaining ?? 0;
  const allocated = (unit: ResourceUnit): number =>
    snapshot?.resources?.[unit]?.totalAllocated ?? 0;
  const consumed = (unit: ResourceUnit): number => snapshot?.resources?.[unit]?.totalConsumed ?? 0;

  return {
    snapshot,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasFeature,
    hasAnyActive: snapshot?.hasAnyActive ?? false,
    nextExpiryAt: snapshot?.nextExpiryAt ?? null,
    remaining,
    allocated,
    consumed,
  };
}

export default useEntitlements;
