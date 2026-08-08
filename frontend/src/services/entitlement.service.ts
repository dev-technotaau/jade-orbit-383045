import api from '@/lib/api';
import type { EntitlementSnapshot } from '@/types/entitlement';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export const entitlementService = {
  async getMine(): Promise<EntitlementSnapshot> {
    const { data } = await api.get<BackendEnvelope<EntitlementSnapshot>>(
      '/billing/me/entitlements',
    );
    return data.data;
  },
};

export default entitlementService;
