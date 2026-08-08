'use client';

import { useQuery } from '@tanstack/react-query';
import { searchService } from '@/services/search.service';
import { SEED_SUGGESTIONS_MAP } from '@/constants/suggestions';

const KEYS = {
  SUGGEST: (category: string, query: string, region?: string) =>
    ['suggest', category, query, ...(region ? [region] : [])] as const,
};

interface UseSuggestOptions {
  category: string;
  query: string;
  limit?: number;
  region?: string;
  minChars?: number;
  enabled?: boolean;
}

function filterStaticFallback(category: string, query: string): string[] {
  const items = SEED_SUGGESTIONS_MAP[category];
  if (!items) return [];
  if (!query) return items.slice(0, 50);
  const lower = query.toLowerCase();
  return items.filter((s) => s.toLowerCase().includes(lower)).slice(0, 50);
}

/**
 * Generic suggestion hook — queries the unified ES-powered `/search/suggest` endpoint.
 * Falls back to static seed data when the server returns empty or errors.
 */
export function useSuggest({
  category,
  query,
  limit = 15,
  region,
  minChars = 0,
  enabled = true,
}: UseSuggestOptions) {
  const trimmed = query.trim();
  const shouldFetch = enabled && trimmed.length >= minChars;

  const { data, isLoading, isError } = useQuery({
    queryKey: KEYS.SUGGEST(category, trimmed, region),
    queryFn: () => searchService.suggest(trimmed, category, limit, region),
    enabled: shouldFetch,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const serverItems = data?.data?.suggestions ?? [];

  // Fallback: if server returned empty or errored, use static data
  const suggestions: string[] =
    serverItems.length > 0
      ? serverItems.map((s) => s.text)
      : shouldFetch || !enabled
        ? filterStaticFallback(category, trimmed)
        : filterStaticFallback(category, trimmed);

  return { suggestions, isLoading: shouldFetch && isLoading, isError };
}

/**
 * For small fixed-size lists (visa_status, revenue_range, indian_state, etc.)
 * Fetches the full list once with q='', cached for a long time.
 */
export function useStaticSuggestions(category: string, limit: number = 100) {
  const { data, isLoading } = useQuery({
    queryKey: KEYS.SUGGEST(category, '', undefined),
    queryFn: () => searchService.suggest('', category, limit),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const serverItems = data?.data?.suggestions ?? [];
  const suggestions: string[] =
    serverItems.length > 0
      ? serverItems.map((s) => s.text)
      : (SEED_SUGGESTIONS_MAP[category] ?? []).slice(0, limit);

  return { suggestions, isLoading };
}
