'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchService } from '@/services/search.service';
import { useAuthStore } from '@/store/auth.store';

const KEYS = {
  FIELD_HISTORY: (field: string) => ['field-history', field],
};

/**
 * Get per-user field history (e.g. recent locations).
 * Only fetches when authenticated.
 */
export function useFieldHistory(field: string, limit: number = 10) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  return useQuery({
    queryKey: KEYS.FIELD_HISTORY(field),
    queryFn: () => searchService.getFieldHistory(field, limit),
    // Wait until useAuth has verified the session — see
    // use-entitlements.ts for the gate rationale.
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation to record a value in field history.
 */
export function useAddToFieldHistory(field: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: string) => searchService.addToFieldHistory(field, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.FIELD_HISTORY(field) });
    },
  });
}

/**
 * Mutation to clear all field history entries.
 */
export function useClearFieldHistory(field: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => searchService.clearFieldHistory(field),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.FIELD_HISTORY(field) });
    },
  });
}
