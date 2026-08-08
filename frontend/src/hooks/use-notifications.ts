'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notification.service';
import { useAuth } from '@/hooks/use-auth';
import { QUERY_KEYS } from '@/constants/config';
import type { NotificationFilters } from '@/types/notification';

export function useNotifications(filters?: NotificationFilters) {
  return useQuery({
    queryKey: [...QUERY_KEYS.NOTIFICATIONS.LIST, filters],
    queryFn: () => notificationService.getNotifications(filters),
  });
}

/** Returns true when the browser tab is visible */
function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return visible;
}

export function useUnreadCount(category?: string) {
  const isVisible = usePageVisible();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: category
      ? [...QUERY_KEYS.NOTIFICATIONS.UNREAD_COUNT, category]
      : QUERY_KEYS.NOTIFICATIONS.UNREAD_COUNT,
    queryFn: () => notificationService.getUnreadCount(category),
    // Wait until useAuth has verified the session — see
    // use-entitlements.ts for the same gate + rationale.
    enabled: isAuthenticated && !authLoading,
    // Poll every 30s when tab is visible, pause when hidden
    refetchInterval: isVisible ? 30_000 : false,
    // Immediately refetch when tab becomes visible again
    refetchOnWindowFocus: true,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.LIST });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.UNREAD_COUNT });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.LIST });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS.UNREAD_COUNT });
    },
  });
}
