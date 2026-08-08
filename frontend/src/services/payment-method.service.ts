import api from '@/lib/api';
import type { PaymentMethodToken } from '@/types/payment-method';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export const paymentMethodService = {
  async list(): Promise<PaymentMethodToken[]> {
    const { data } = await api.get<BackendEnvelope<PaymentMethodToken[]>>('/billing/methods');
    return data.data;
  },
  async setDefault(id: string): Promise<PaymentMethodToken> {
    const { data } = await api.post<BackendEnvelope<PaymentMethodToken>>(
      `/billing/methods/${encodeURIComponent(id)}/default`,
    );
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/billing/methods/${encodeURIComponent(id)}`);
  },
};

export default paymentMethodService;
