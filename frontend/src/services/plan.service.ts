import api from '@/lib/api';
import type { Plan, PlanCategory } from '@/types/billing';

export interface ListPlansQuery {
  category?: PlanCategory;
}

interface BackendEnvelope<T> {
  success?: boolean;
  status?: string;
  message?: string;
  data: T;
}

/**
 * Plan catalog client.
 *
 * Backend mounts the public catalog at `/api/v1/plans/*` and the BFF
 * proxy strips `/api/v1` and prepends it back when forwarding. We call
 * relative paths (without the `/v1/` prefix) — the proxy handles versioning.
 */
export const planService = {
  async list(query: ListPlansQuery = {}): Promise<Plan[]> {
    const { data } = await api.get<BackendEnvelope<Plan[]>>('/plans', { params: query });
    return data?.data ?? [];
  },

  async getByCode(code: string): Promise<Plan | null> {
    const { data } = await api.get<BackendEnvelope<Plan>>(
      `/plans/code/${encodeURIComponent(code)}`,
    );
    return data?.data ?? null;
  },

  async getBySlug(slug: string): Promise<Plan | null> {
    const { data } = await api.get<BackendEnvelope<Plan>>(
      `/plans/slug/${encodeURIComponent(slug)}`,
    );
    return data?.data ?? null;
  },
};

export default planService;
