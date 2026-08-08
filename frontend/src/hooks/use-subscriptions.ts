import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscriptionService } from '@/services/subscription.service';

const SUBS_KEY = ['my-subscriptions'] as const;

export function useMySubscriptions() {
  return useQuery({
    queryKey: SUBS_KEY,
    queryFn: () => subscriptionService.list(),
    staleTime: 30_000,
  });
}

export function useSubscription(id: string | undefined) {
  return useQuery({
    queryKey: ['my-subscription', id],
    queryFn: () => (id ? subscriptionService.get(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string; cancelImmediately?: boolean }) =>
      subscriptionService.cancel(args.id, {
        reason: args.reason,
        cancelImmediately: args.cancelImmediately,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}

export function useToggleAutoRenew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; autoRenew: boolean; reason?: string }) =>
      subscriptionService.toggleAutoRenew(args.id, args.autoRenew, args.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}

export function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string }) =>
      subscriptionService.pause(args.id, args.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}

export function useResumeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subscriptionService.resume(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}
