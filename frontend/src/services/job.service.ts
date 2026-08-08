import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Job,
  JobApplication,
  CreateJobRequest,
  UpdateJobRequest,
  JobSearchFilters,
  ScreeningAnswerInput,
} from '@/types/job';

export const jobService = {
  async searchJobs(filters: JobSearchFilters): Promise<PaginatedResponse<Job>> {
    const qs = buildQueryString(filters as Record<string, string | undefined>);
    const res = await api.get(`${API.JOBS.SEARCH}${qs}`);
    return res.data;
  },

  async getJob(id: string): Promise<ApiResponse<Job>> {
    const res = await api.get(API.JOBS.DETAIL(id));
    const body = res.data;
    // Backend wraps as { data: { job } } — unwrap to { data: Job }
    return { ...body, data: body.data?.job ?? body.data };
  },

  async createJob(data: CreateJobRequest): Promise<ApiResponse<Job>> {
    const res = await api.post(API.JOBS.CREATE, data);
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },

  async updateJob(id: string, data: UpdateJobRequest): Promise<ApiResponse<Job>> {
    const res = await api.put(API.JOBS.UPDATE(id), data);
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },

  async deactivateJob(id: string): Promise<ApiResponse<Job>> {
    const res = await api.patch(API.JOBS.DEACTIVATE(id));
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },

  async cloneJob(id: string): Promise<ApiResponse<Job>> {
    const res = await api.post(API.JOBS.CLONE(id));
    const body = res.data;
    return { ...body, data: body.data?.job ?? body.data };
  },

  async applyToJob(
    id: string,
    data?: { coverLetter?: string; screeningAnswers?: ScreeningAnswerInput[] },
  ): Promise<ApiResponse<JobApplication>> {
    const res = await api.post(API.JOBS.APPLY(id), data);
    const body = res.data;
    return { ...body, data: body.data?.application ?? body.data };
  },

  async toggleSaveJob(id: string): Promise<ApiResponse<{ saved: boolean }>> {
    const res = await api.post(API.JOBS.SAVE(id));
    return res.data;
  },

  async getSavedJobs(page?: number, limit?: number): Promise<PaginatedResponse<Job>> {
    const qs = buildQueryString({ page, limit });
    const res = await api.get(`${API.JOBS.SAVED}${qs}`);
    return res.data;
  },

  async getAppliedJobs(
    page?: number,
    limit?: number,
    status?: string,
  ): Promise<PaginatedResponse<JobApplication>> {
    const qs = buildQueryString({ page, limit, status });
    const res = await api.get(`${API.JOBS.APPLIED}${qs}`);
    return res.data;
  },

  async getMyJobs(page?: number, limit?: number, status?: string): Promise<PaginatedResponse<Job>> {
    const qs = buildQueryString({ page, limit, status });
    const res = await api.get(`${API.JOBS.MY_JOBS}${qs}`);
    return res.data;
  },

  async getApplication(id: string): Promise<ApiResponse<JobApplication>> {
    const res = await api.get(API.JOBS.APPLICATION_DETAIL(id));
    return res.data;
  },

  async getJobApplications(
    jobId: string,
    page?: number,
    limit?: number,
    status?: string,
  ): Promise<PaginatedResponse<JobApplication>> {
    const qs = buildQueryString({ page, limit, status });
    const res = await api.get(`${API.JOBS.APPLICATIONS(jobId)}${qs}`);
    return res.data;
  },

  /**
   * Record hires made off-platform for a posting (absolute count, not a delta).
   * The server clamps it against on-platform hires and auto-closes the job
   * when this tips it to fully filled.
   */
  async updateOfflineHires(
    jobId: string,
    offlineHiresCount: number,
  ): Promise<
    ApiResponse<{
      job: {
        id: string;
        numberOfOpenings: number | null;
        offlineHiresCount: number;
        status: string;
        onPlatformHires: number;
      };
    }>
  > {
    const res = await api.patch(API.JOBS.OFFLINE_HIRES(jobId), { offlineHiresCount });
    return res.data;
  },

  async updateApplicationStatus(
    applicationId: string,
    data: { status: string; rejectionReason?: string },
  ): Promise<ApiResponse<JobApplication>> {
    const res = await api.patch(API.JOBS.UPDATE_APPLICATION(applicationId), data);
    return res.data;
  },

  async withdrawApplication(applicationId: string): Promise<ApiResponse<JobApplication>> {
    const res = await api.patch(API.JOBS.WITHDRAW_APPLICATION(applicationId));
    return res.data;
  },
};
