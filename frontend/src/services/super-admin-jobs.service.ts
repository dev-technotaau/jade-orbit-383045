import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type { Job, CreateJobRequest, UpdateJobRequest } from '@/types/job';

/** A company option for the super-admin job poster's company selector. */
export interface SuperAdminCompanyOption {
  id: string;
  companyName: string;
  logo: string | null;
  city: string | null;
  state: string | null;
  isVerified: boolean;
  ownerEmail: string | null;
}

interface CompaniesPage {
  items: SuperAdminCompanyOption[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Super-admin job tooling — post / edit a job on behalf of a company.
 * Mirrors `jobService` but targets the `/super-admin/jobs` endpoints (which
 * bypass plan-gating). Create requires an explicit `companyId`.
 */
export const superAdminJobService = {
  async listCompanies(q?: string, page = 1, limit = 20): Promise<ApiResponse<CompaniesPage>> {
    const res = await api.get(API.SUPER_ADMIN.JOBS_COMPANIES, { params: { q, page, limit } });
    return res.data;
  },

  async getJob(id: string): Promise<ApiResponse<Job>> {
    const res = await api.get(API.SUPER_ADMIN.JOB_GET(id));
    const body = res.data;
    // Backend wraps as { data: { job } } — unwrap to { data: Job }
    return { ...body, data: body.data?.job ?? body.data };
  },

  async createJob(companyId: string, data: CreateJobRequest): Promise<ApiResponse<Job>> {
    const res = await api.post(API.SUPER_ADMIN.JOBS_CREATE, { companyId, ...data });
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },

  /**
   * `expectedUpdatedAt` is the optimistic-concurrency token: the
   * `updatedAt` the editor loaded. The server refuses the write with 409
   * `STALE_WRITE` if the row has moved since, so a second admin's save
   * cannot silently destroy the first's. Omit it to force an overwrite.
   */
  async updateJob(
    id: string,
    data: UpdateJobRequest & { expectedUpdatedAt?: string },
  ): Promise<ApiResponse<Job>> {
    const res = await api.put(API.SUPER_ADMIN.JOB_UPDATE(id), data);
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },
};
