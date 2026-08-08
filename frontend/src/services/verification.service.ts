import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  VerificationRequest,
  ReviewVerificationRequest,
  EscalateVerificationRequest,
  VerificationStats,
  VerificationFilters,
} from '@/types/verification';

export const verificationService = {
  async requestVerification(
    type: string,
    data?: Record<string, unknown>,
    document?: File,
  ): Promise<ApiResponse<VerificationRequest>> {
    const formData = new FormData();
    formData.append('type', type);
    if (data) formData.append('data', JSON.stringify(data));
    if (document) formData.append('document', document);
    const res = await api.post(API.VERIFICATIONS.REQUEST, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },

  async getMyVerifications(): Promise<ApiResponse<VerificationRequest[]>> {
    const res = await api.get(API.VERIFICATIONS.MINE);
    const body = res.data;
    return { ...body, data: body.data?.verifications ?? body.data };
  },

  async getPendingVerifications(
    filters: VerificationFilters,
  ): Promise<PaginatedResponse<VerificationRequest>> {
    const qs = buildQueryString(filters as Record<string, string | undefined>);
    const res = await api.get(`${API.VERIFICATIONS.PENDING}${qs}`);
    return res.data;
  },

  async getAllVerifications(
    filters: VerificationFilters,
  ): Promise<PaginatedResponse<VerificationRequest>> {
    const qs = buildQueryString(filters as Record<string, string | undefined>);
    const res = await api.get(`${API.VERIFICATIONS.ALL}${qs}`);
    return res.data;
  },

  async reviewVerification(
    id: string,
    data: ReviewVerificationRequest,
  ): Promise<ApiResponse<VerificationRequest>> {
    const res = await api.post(API.VERIFICATIONS.REVIEW(id), data);
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },

  async escalateVerification(
    id: string,
    data: EscalateVerificationRequest,
  ): Promise<ApiResponse<VerificationRequest>> {
    const res = await api.post(API.VERIFICATIONS.ESCALATE(id), data);
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },

  async getVerificationStats(): Promise<ApiResponse<VerificationStats>> {
    const res = await api.get(API.VERIFICATIONS.STATS);
    return res.data;
  },

  async sendEmploymentContact(
    id: string,
    data: {
      contactName: string;
      contactEmail: string;
      companyName: string;
      candidateName: string;
      employmentPeriod: string;
      role: string;
    },
  ): Promise<ApiResponse<{ message: string }>> {
    const res = await api.post(API.VERIFICATIONS.EMPLOYMENT_CONTACT(id), data);
    return res.data;
  },

  async submitEmploymentResponse(
    token: string,
    action: 'confirm' | 'deny',
    comments?: string,
  ): Promise<ApiResponse<{ action: string; status: string }>> {
    const res = await api.post(API.VERIFICATIONS.EMPLOYMENT_RESPONSE(token), { action, comments });
    return res.data;
  },

  async setSlaDeadline(id: string, deadline: string): Promise<ApiResponse<VerificationRequest>> {
    const res = await api.patch(API.VERIFICATIONS.SET_SLA(id), { deadline });
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },

  async setApprovalChain(
    id: string,
    chain: Array<{ level: number; approverId: string }>,
  ): Promise<ApiResponse<VerificationRequest>> {
    const res = await api.post(API.VERIFICATIONS.SET_APPROVAL_CHAIN(id), { chain });
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },

  async approveAtLevel(id: string, comments?: string): Promise<ApiResponse<VerificationRequest>> {
    const res = await api.post(API.VERIFICATIONS.APPROVE_LEVEL(id), { comments });
    const body = res.data;
    return { ...body, data: body.data?.request ?? body.data };
  },
};
