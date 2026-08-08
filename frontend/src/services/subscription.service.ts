import api from '@/lib/api';
import type {
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  SubscriptionDetail,
  SubscriptionListItem,
  SubscriptionStatus,
} from '@/types/subscription';

interface BackendEnvelope<T> {
  success?: boolean;
  status?: string;
  message?: string;
  data: T;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `sub_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export const subscriptionService = {
  async create(input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse> {
    const idemKey = generateIdempotencyKey();
    const { data } = await api.post<BackendEnvelope<CreateSubscriptionResponse>>(
      '/billing/subscriptions',
      input,
      { headers: { 'Idempotency-Key': idemKey } },
    );
    return data.data;
  },

  async list(): Promise<SubscriptionListItem[]> {
    const { data } =
      await api.get<BackendEnvelope<SubscriptionListItem[]>>('/billing/subscriptions');
    return data.data;
  },

  async get(id: string): Promise<SubscriptionDetail> {
    const { data } = await api.get<BackendEnvelope<SubscriptionDetail>>(
      `/billing/subscriptions/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  async cancel(
    id: string,
    args: { reason?: string; cancelImmediately?: boolean } = {},
  ): Promise<{
    id: string;
    status: SubscriptionStatus;
    cancelAtCycleEnd: boolean;
    endedAt: string | null;
  }> {
    const { data } = await api.post<
      BackendEnvelope<{
        id: string;
        status: SubscriptionStatus;
        cancelAtCycleEnd: boolean;
        endedAt: string | null;
      }>
    >(`/billing/subscriptions/${encodeURIComponent(id)}/cancel`, args);
    return data.data;
  },

  async pause(id: string, reason?: string): Promise<{ id: string; status: SubscriptionStatus }> {
    const { data } = await api.post<
      BackendEnvelope<{ id: string; status: SubscriptionStatus; pausedAt: string | null }>
    >(`/billing/subscriptions/${encodeURIComponent(id)}/pause`, { reason });
    return data.data;
  },

  async resume(id: string): Promise<{ id: string; status: SubscriptionStatus }> {
    const { data } = await api.post<BackendEnvelope<{ id: string; status: SubscriptionStatus }>>(
      `/billing/subscriptions/${encodeURIComponent(id)}/resume`,
    );
    return data.data;
  },

  async toggleAutoRenew(
    id: string,
    autoRenew: boolean,
    reason?: string,
  ): Promise<{
    id: string;
    status: SubscriptionStatus;
    autoRenew: boolean;
    cancelAtCycleEnd: boolean;
  }> {
    const { data } = await api.post<
      BackendEnvelope<{
        id: string;
        status: SubscriptionStatus;
        autoRenew: boolean;
        cancelAtCycleEnd: boolean;
      }>
    >(`/billing/subscriptions/${encodeURIComponent(id)}/toggle-autorenew`, {
      autoRenew,
      reason,
    });
    return data.data;
  },
};

export default subscriptionService;
