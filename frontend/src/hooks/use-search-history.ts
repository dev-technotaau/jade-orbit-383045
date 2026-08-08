'use client';

/**
 * React Query–backed hook for the search-history chip carousel.
 *
 * - `list` is fetched on mount + revalidated every 30min for the
 *   new-job count delta freshness.
 * - `record` is debounced via TanStack mutate (caller debounces the
 *   triggering search input).
 * - `remove` invalidates the list cache.
 *
 * Same hook is used on the homepage hero, public listing page header,
 * and candidate dashboard recent-searches widget.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  searchHistoryService,
  type SearchHistoryEntry,
  type SearchHistoryType,
} from '@/services/search-history.service';

const STALE_MIN = 30 * 60 * 1000;

export function useSearchHistory(type: SearchHistoryType = 'JOB', limit = 12) {
  const queryClient = useQueryClient();
  const queryKey = ['search-history', type, limit];

  const list = useQuery<SearchHistoryEntry[]>({
    queryKey,
    queryFn: () => searchHistoryService.list(type, limit),
    staleTime: STALE_MIN,
    refetchOnWindowFocus: true,
    refetchInterval: STALE_MIN,
  });

  const record = useMutation({
    mutationFn: (input: {
      filters: Record<string, unknown>;
      query?: string;
      location?: string;
      resultsCount?: number;
    }) =>
      searchHistoryService.record({
        searchType: type,
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => searchHistoryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    items: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    record: record.mutate,
    remove: remove.mutate,
  };
}
