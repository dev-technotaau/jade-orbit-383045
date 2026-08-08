import api from '@/lib/api';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface UnlockResult {
  email: string;
  phone: string | null;
  alternateEmail: string | null;
  alternatePhone: string | null;
  cached: boolean;
}

export const cvUnlockService = {
  async unlock(candidateId: string): Promise<UnlockResult> {
    const { data } = await api.post<BackendEnvelope<UnlockResult>>(
      `/billing/cv-unlock/${encodeURIComponent(candidateId)}/unlock`,
    );
    return data.data;
  },

  async listUnlocked(args: { page?: number; limit?: number } = {}) {
    const { data } = await api.get<
      BackendEnvelope<{ items: { candidateId: string; unlockedAt: string }[]; total: number }>
    >('/billing/cv-unlock/me/unlocked', { params: args });
    return data.data;
  },
};

export default cvUnlockService;
