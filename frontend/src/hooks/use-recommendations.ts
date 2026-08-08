'use client';

import { useQuery } from '@tanstack/react-query';
import { recommendationService } from '@/services/recommendation.service';
import { QUERY_KEYS } from '@/constants/config';

export function useRecommendedJobs() {
  return useQuery({
    queryKey: QUERY_KEYS.RECOMMENDATIONS.JOBS,
    queryFn: () => recommendationService.getRecommendedJobs(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useRecommendedCandidates(jobId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.RECOMMENDATIONS.CANDIDATES(jobId),
    queryFn: () => recommendationService.getRecommendedCandidates(jobId),
    enabled: !!jobId,
    staleTime: 10 * 60 * 1000,
  });
}
