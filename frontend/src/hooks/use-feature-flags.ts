import { useQuery } from '@tanstack/react-query';
import { featureFlagService } from '@/services/feature-flag.service';
import { QUERY_KEYS } from '@/constants/config';
import type { FeatureFlags } from '@/types/feature-flag';

/** Hook to get client-visible feature flags (public, cached 1min) */
export function useFeatureFlags() {
  return useQuery<FeatureFlags>({
    queryKey: QUERY_KEYS.FEATURE_FLAGS.CLIENT,
    queryFn: featureFlagService.getClientFlags,
    staleTime: 60 * 1000, // 1 minute — matches backend cache TTL
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Convenience hook for a single flag */
export function useFeatureFlag<T extends boolean | string | number>(
  key: string,
  defaultValue: T,
): T {
  const { data } = useFeatureFlags();
  if (!data || !(key in data)) return defaultValue;
  return data[key] as T;
}

/** Hook to get all flags (admin only) */
export function useAllFeatureFlags() {
  return useQuery<FeatureFlags>({
    queryKey: QUERY_KEYS.FEATURE_FLAGS.ALL,
    queryFn: featureFlagService.getAllFlags,
    staleTime: 60 * 1000, // 1 minute for admin view
    retry: 1,
  });
}
