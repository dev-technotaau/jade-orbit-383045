import api from '@/lib/api';

export type AssistedHiringStatus =
  | 'PENDING'
  | 'CALL_SCHEDULED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface AssistedMatchedProfile {
  id: string;
  candidateUserId: string | null;
  candidateName: string;
  candidateHeadline: string | null;
  candidateExperience: string | null;
  candidateLocation: string | null;
  resumeUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AssistedHiringRequest {
  id: string;
  employerId: string;
  orderId: string | null;
  jobPostId: string | null;
  roleTitle: string;
  requirementText: string;
  preferredSkills: string[];
  preferredLocation: string | null;
  budgetRange: string | null;
  noticePeriod: string | null;
  contactEmail: string;
  contactPhone: string | null;
  status: AssistedHiringStatus;
  internalNotes: string | null;
  callScheduledAt: string | null;
  deliveredAt: string | null;
  startedAt: string;
  expiresAt: string | null;
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  matchedProfiles?: AssistedMatchedProfile[];
  assignedAdmin?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  employer?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  jobPost?: { id: string; title: string } | null;
}

export interface RequirementInput {
  roleTitle?: string;
  requirementText?: string;
  preferredSkills?: string[];
  preferredLocation?: string;
  budgetRange?: string;
  noticePeriod?: string;
  contactPhone?: string;
}

export const assistedHiringService = {
  async getMine(): Promise<AssistedHiringRequest | null> {
    const { data } =
      await api.get<BackendEnvelope<AssistedHiringRequest | null>>('/assisted-hiring/me');
    return data.data;
  },

  async updateRequirement(
    requestId: string,
    input: RequirementInput,
  ): Promise<AssistedHiringRequest> {
    const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
      `/assisted-hiring/${encodeURIComponent(requestId)}/requirement`,
      input,
    );
    return data.data;
  },

  // ── Super-admin ──
  superAdmin: {
    async list(args: { status?: AssistedHiringStatus; page?: number; limit?: number } = {}) {
      const { data } = await api.get<
        BackendEnvelope<{
          items: (AssistedHiringRequest & { matchedCount: number })[];
          pagination: { total: number; page: number; limit: number; pages: number };
        }>
      >('/super-admin/assisted-hiring', { params: args });
      return data.data;
    },
    async detail(id: string): Promise<AssistedHiringRequest> {
      const { data } = await api.get<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}`,
      );
      return data.data;
    },
    async claim(id: string): Promise<AssistedHiringRequest> {
      const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/claim`,
      );
      return data.data;
    },
    async scheduleCall(id: string, callAt: string, internalNotes?: string) {
      const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/schedule-call`,
        { callAt, internalNotes },
      );
      return data.data;
    },
    async startSourcing(id: string) {
      const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/start`,
      );
      return data.data;
    },
    async addProfile(
      id: string,
      input: {
        candidateUserId?: string;
        candidateName: string;
        candidateHeadline?: string;
        candidateExperience?: string;
        candidateLocation?: string;
        resumeUrl?: string;
        notes?: string;
      },
    ): Promise<AssistedMatchedProfile> {
      const { data } = await api.post<BackendEnvelope<AssistedMatchedProfile>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/profiles`,
        input,
      );
      return data.data;
    },
    async removeProfile(profileId: string) {
      await api.delete(`/super-admin/assisted-hiring/profiles/${encodeURIComponent(profileId)}`);
    },
    async deliver(id: string, customMessage?: string): Promise<AssistedHiringRequest> {
      const { data } = await api.post<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/deliver`,
        { customMessage },
      );
      return data.data;
    },
    async complete(id: string): Promise<AssistedHiringRequest> {
      const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/complete`,
      );
      return data.data;
    },
    async cancel(id: string, reason?: string): Promise<AssistedHiringRequest> {
      const { data } = await api.patch<BackendEnvelope<AssistedHiringRequest>>(
        `/super-admin/assisted-hiring/${encodeURIComponent(id)}/cancel`,
        { reason },
      );
      return data.data;
    },
  },
};

export default assistedHiringService;
