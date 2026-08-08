'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchService } from '@/services/search.service';
import { useAuthStore } from '@/store/auth.store';

const KEYS = {
  AUTOCOMPLETE: (q: string, type: string) => ['search', 'autocomplete', q, type],
  SUGGEST_SKILLS: (q: string) => ['search', 'suggest', 'skills', q],
  SUGGEST_LOCATIONS: (q: string) => ['search', 'suggest', 'locations', q],
  SUGGEST_COMPANIES: (q: string) => ['search', 'suggest', 'companies', q],
  SUGGEST_TITLES: (q: string) => ['search', 'suggest', 'titles', q],
  DID_YOU_MEAN: (q: string, index: string) => ['search', 'did-you-mean', q, index],
  HISTORY: ['search', 'history'],
  POPULAR: ['search', 'popular'],
};

export function useAutocomplete(query: string, type: 'jobs' | 'candidates' | 'all' = 'all') {
  return useQuery({
    queryKey: KEYS.AUTOCOMPLETE(query, type),
    queryFn: () => searchService.autocomplete(query, type),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useSuggestSkills(query: string) {
  return useQuery({
    queryKey: KEYS.SUGGEST_SKILLS(query),
    queryFn: () => searchService.suggestSkills(query),
    enabled: query.length >= 1,
    staleTime: 60 * 1000,
  });
}

export function useSuggestLocations(query: string) {
  return useQuery({
    queryKey: KEYS.SUGGEST_LOCATIONS(query),
    queryFn: () => searchService.suggestLocations(query),
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useSuggestCompanies(query: string) {
  return useQuery({
    queryKey: KEYS.SUGGEST_COMPANIES(query),
    queryFn: () => searchService.suggestCompanies(query),
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useSuggestJobTitles(query: string) {
  return useQuery({
    queryKey: KEYS.SUGGEST_TITLES(query),
    queryFn: () => searchService.suggestJobTitles(query),
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useDidYouMean(query: string, index: 'jobs' | 'candidates' = 'jobs') {
  return useQuery({
    queryKey: KEYS.DID_YOU_MEAN(query, index),
    queryFn: () => searchService.didYouMean(query, index),
    enabled: query.length >= 3,
    staleTime: 60 * 1000,
  });
}

export function useSearchHistory() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  return useQuery({
    queryKey: KEYS.HISTORY,
    queryFn: () => searchService.getSearchHistory(10),
    // Wait until useAuth has verified the session — see
    // use-entitlements.ts for the gate rationale.
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePopularSearches() {
  return useQuery({
    queryKey: KEYS.POPULAR,
    queryFn: () => searchService.getPopularSearches(10),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddToSearchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ query, type }: { query: string; type: 'job' | 'candidate' }) =>
      searchService.addToSearchHistory(query, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.HISTORY });
    },
  });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => searchService.clearSearchHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.HISTORY });
    },
  });
}
