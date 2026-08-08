import { useQuery } from '@tanstack/react-query';
import { planService, type ListPlansQuery } from '@/services/plan.service';
import type { Plan } from '@/types/billing';

const PLANS_KEY = ['plans'] as const;

export function usePlans(query: ListPlansQuery = {}) {
  return useQuery<Plan[]>({
    queryKey: [...PLANS_KEY, query],
    queryFn: () => planService.list(query),
    staleTime: 60_000 * 5,
  });
}

export function usePlanByCode(code: string | undefined | null) {
  return useQuery<Plan | null>({
    queryKey: [...PLANS_KEY, 'code', code],
    queryFn: () => (code ? planService.getByCode(code) : Promise.resolve(null)),
    enabled: Boolean(code),
    staleTime: 60_000 * 5,
  });
}

export function usePlanBySlug(slug: string | undefined | null) {
  return useQuery<Plan | null>({
    queryKey: [...PLANS_KEY, 'slug', slug],
    queryFn: () => (slug ? planService.getBySlug(slug) : Promise.resolve(null)),
    enabled: Boolean(slug),
    staleTime: 60_000 * 5,
  });
}
