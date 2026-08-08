import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  CompanyProfile,
  CompanyProfileCompleteness,
  EmployerDashboard,
  UpdateCompanyRequest,
  EngagementMetrics,
  EmployerAnalytics,
} from '@/types/employer';
import type { CandidateProfile, CandidateSearchFilters } from '@/types/candidate';
import type { JobApplication, ApplicationStatus } from '@/types/job';

export const employerService = {
  async getDashboard(): Promise<ApiResponse<EmployerDashboard>> {
    const res = await api.get(API.EMPLOYERS.DASHBOARD);
    const body = res.data;
    const d = body.data;
    // Transform backend shape to frontend EmployerDashboard
    return {
      ...body,
      data: {
        activeJobsCount: d?.activeJobs ?? d?.activeJobsCount ?? 0,
        totalApplications: d?.totalApplications ?? 0,
        shortlistedCount: d?.applicationsByStatus?.SHORTLISTED ?? d?.shortlistedCount ?? 0,
        profileViews: d?.profileViewsCount ?? d?.profileViews ?? 0,
        recentApplications: (d?.recentApplications ?? []).map((app: Record<string, unknown>) => ({
          id: app.id as string,
          candidateName:
            (app.candidateName as string) ??
            `${(app.candidate as Record<string, unknown>)?.user ? ((app.candidate as Record<string, Record<string, string>>).user.firstName ?? '') + ' ' + ((app.candidate as Record<string, Record<string, string>>).user.lastName ?? '') : ''}`.trim(),
          jobTitle: (app.jobTitle as string) ?? (app.job as Record<string, string>)?.title ?? '',
          status: app.status as string,
          appliedAt: app.appliedAt as string,
        })),
        jobPerformance: d?.jobPerformance ?? [],
      },
    };
  },

  async getCompleteness(): Promise<ApiResponse<CompanyProfileCompleteness>> {
    const res = await api.get(API.EMPLOYERS.COMPLETENESS);
    const body = res.data;
    const d = body.data;
    return {
      ...body,
      data: {
        score: d?.percentage ?? d?.score ?? 0,
        sections: [
          ...(d?.completed ?? []).map((name: string) => ({ name, completed: true, weight: 1 })),
          ...(d?.missing ?? []).map((name: string) => ({ name, completed: false, weight: 1 })),
          ...(d?.sections ?? []),
        ],
      },
    };
  },

  async getCompany(): Promise<ApiResponse<CompanyProfile>> {
    const res = await api.get(API.EMPLOYERS.ME);
    return res.data;
  },

  async getCompanyById(id: string): Promise<ApiResponse<CompanyProfile>> {
    const res = await api.get(API.EMPLOYERS.PUBLIC_PROFILE(id));
    return res.data;
  },

  async updateCompany(data: UpdateCompanyRequest): Promise<ApiResponse<CompanyProfile>> {
    const res = await api.put(API.EMPLOYERS.ME, data);
    return res.data;
  },

  async uploadLogo(file: File): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await api.post(API.EMPLOYERS.LOGO, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = res.data;
    // Backend returns { data: { logo: "url" } } — normalize to { url }
    return { ...body, data: { url: body.data?.logo ?? body.data?.url ?? '' } };
  },

  async removeLogo(): Promise<ApiResponse<null>> {
    const res = await api.delete(API.EMPLOYERS.LOGO);
    return res.data;
  },

  async uploadCoverImage(file: File): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append('coverImage', file);
    const res = await api.post(API.EMPLOYERS.COVER_IMAGE, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = res.data;
    return { ...body, data: { url: body.data?.coverImage ?? body.data?.url ?? '' } };
  },

  async removeCoverImage(): Promise<ApiResponse<null>> {
    const res = await api.delete(API.EMPLOYERS.COVER_IMAGE);
    return res.data;
  },

  async getProfileViews(): Promise<ApiResponse<{ views: number }>> {
    const res = await api.get(API.EMPLOYERS.PROFILE_VIEWS);
    return res.data;
  },

  async searchCandidates(
    filters: CandidateSearchFilters,
  ): Promise<PaginatedResponse<CandidateProfile>> {
    // Strip UI-only keys that aren't backend params
    const { experienceBucket: _eb, salaryBucket: _sb, ...apiFilters } = filters;
    const qs = buildQueryString(apiFilters as Record<string, string | undefined>);
    const res = await api.get(`${API.EMPLOYERS.SEARCH_CANDIDATES}${qs}`);
    return res.data;
  },

  async toggleSavedCandidate(candidateId: string): Promise<ApiResponse<{ saved: boolean }>> {
    const res = await api.post(API.EMPLOYERS.SAVE_CANDIDATE(candidateId));
    return res.data;
  },

  async getSavedCandidates(
    page?: number,
    limit?: number,
  ): Promise<PaginatedResponse<CandidateProfile>> {
    const qs = buildQueryString({ page, limit });
    const res = await api.get(`${API.EMPLOYERS.SAVED_CANDIDATES}${qs}`);
    return res.data;
  },

  async updateSavedCandidateNotes(candidateId: string, notes: string): Promise<ApiResponse<null>> {
    const res = await api.patch(API.EMPLOYERS.SAVED_CANDIDATE_NOTES(candidateId), { notes });
    return res.data;
  },

  async getEngagementMetrics(): Promise<ApiResponse<EngagementMetrics>> {
    const res = await api.get(API.EMPLOYERS.ENGAGEMENT_METRICS);
    return res.data;
  },

  async getAnalytics(filters?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }): Promise<ApiResponse<EmployerAnalytics>> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.EMPLOYERS.ANALYTICS}${qs}`);
    return res.data;
  },

  async exportAnalytics(filters?: { startDate?: string; endDate?: string }): Promise<Blob> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.EMPLOYERS.ANALYTICS_EXPORT}${qs}`, {
      responseType: 'blob',
    });
    return res.data;
  },

  async shortlistCandidateForJob(
    candidateId: string,
    jobId: string,
  ): Promise<ApiResponse<JobApplication>> {
    const res = await api.post(API.EMPLOYERS.SHORTLIST_CANDIDATE(candidateId), { jobId });
    return res.data;
  },

  async selectCandidateForJob(
    candidateId: string,
    jobId: string,
  ): Promise<ApiResponse<JobApplication>> {
    const res = await api.post(API.EMPLOYERS.SELECT_CANDIDATE(candidateId), { jobId });
    return res.data;
  },

  async bulkExportCandidates(data: {
    candidateIds: string[];
    format: 'csv' | 'xlsx';
  }): Promise<ApiResponse<{ jobId: string }>> {
    const res = await api.post(API.EMPLOYERS.BULK_EXPORT_CANDIDATES, data);
    return res.data;
  },

  async bulkExportResumes(candidateIds: string[]): Promise<ApiResponse<{ jobId: string }>> {
    const res = await api.post(API.EMPLOYERS.BULK_EXPORT_RESUMES, { candidateIds });
    return res.data;
  },

  async getCandidateMatchScore(
    candidateId: string,
    jobId: string,
  ): Promise<
    ApiResponse<{
      overall: number;
      dimensions: {
        skills: number;
        experience: number;
        salary: number;
        location: number;
        industry: number;
        workMode: number;
        education: number;
        noticePeriod: number;
        experienceLevel: number;
        functionalArea: number;
        jobType: number;
        educationLevel: number;
        drivingLicense: number;
      };
    }>
  > {
    const res = await api.get(API.EMPLOYERS.CANDIDATE_MATCH_SCORE(candidateId, jobId));
    return res.data;
  },

  async getSimilarCandidates(
    candidateId: string,
    limit = 5,
  ): Promise<ApiResponse<CandidateProfile[]>> {
    const res = await api.get(`${API.EMPLOYERS.SIMILAR_CANDIDATES(candidateId)}?limit=${limit}`);
    return res.data;
  },

  async getAllApplications(filters?: {
    status?: ApplicationStatus;
    jobId?: string;
    candidateId?: string;
    search?: string;
    sortBy?: 'newest' | 'oldest' | 'matchScore';
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<JobApplication>> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.EMPLOYERS.APPLICATIONS}${qs}`);
    return res.data;
  },
};
