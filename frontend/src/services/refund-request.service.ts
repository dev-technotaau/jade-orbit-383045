import api from '@/lib/api';
import type {
  CreateRefundRequestInput,
  RefundEligibility,
  RefundRequest,
  RefundRequestWithContext,
} from '@/types/refund';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

/**
 * Customer refund requests. Mirrors `/billing/refund-requests/*`.
 *
 * Raising a request never moves money — it queues for super-admin review. The
 * approval side lives in `super-admin-billing.service.ts`.
 */
export const refundRequestService = {
  /** Can this order be refunded, how much, and is it inside the window? */
  async getEligibility(orderId: string): Promise<RefundEligibility> {
    const { data } = await api.get<BackendEnvelope<RefundEligibility>>(
      `/billing/refund-requests/eligibility/${encodeURIComponent(orderId)}`,
    );
    return data.data;
  },

  async create(input: CreateRefundRequestInput): Promise<RefundRequest> {
    const { data } = await api.post<BackendEnvelope<RefundRequest>>(
      '/billing/refund-requests',
      input,
    );
    return data.data;
  },

  /** The authed user's requests, newest first. Optionally scoped to one order. */
  async list(args: { orderId?: string } = {}): Promise<RefundRequestWithContext[]> {
    const { data } = await api.get<BackendEnvelope<RefundRequestWithContext[]>>(
      '/billing/refund-requests',
      { params: args },
    );
    return data.data ?? [];
  },

  /** Withdraw a still-pending request. */
  async cancel(id: string): Promise<RefundRequest> {
    const { data } = await api.post<BackendEnvelope<RefundRequest>>(
      `/billing/refund-requests/${encodeURIComponent(id)}/cancel`,
    );
    return data.data;
  },
};

export default refundRequestService;
