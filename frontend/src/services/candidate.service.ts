import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  CandidateProfile,
  CandidateDashboard,
  ProfileCompleteness,
  ResumeReadiness,
  UpdateCandidateRequest,
  CandidateSearchFilters,
  CandidateAnalytics,
  JobAlert,
  CreateJobAlertRequest,
  UpdateJobAlertRequest,
  ResumeUploadResponse,
  ProfileBoostStatus,
  ActivateProfileBoostResponse,
} from '@/types/candidate';
import type { Job } from '@/types/job';
import type { ParsedResumeData } from '@/types/resume-parse';

/**
 * Mirrors `backend/src/config/resume-templates.ts:ResumeTemplateConfig`.
 * Returned by `/candidates/me/resume/templates`.
 */
export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  file: string;
  requiresPremium: boolean;
  accentColor: string;
}

export const candidateService = {
  async getProfile(): Promise<ApiResponse<CandidateProfile>> {
    const res = await api.get(API.CANDIDATES.ME);
    const body = res.data;
    // Backend wraps in { data: { profile } } — unwrap to match ApiResponse<CandidateProfile>
    return { ...body, data: body.data?.profile ?? body.data };
  },

  async updateProfile(data: UpdateCandidateRequest): Promise<ApiResponse<CandidateProfile>> {
    const res = await api.put(API.CANDIDATES.ME, data);
    const body = res.data;
    return { ...body, data: body.data?.profile ?? body.data };
  },

  async getDashboard(): Promise<ApiResponse<CandidateDashboard>> {
    const res = await api.get(API.CANDIDATES.DASHBOARD);
    const body = res.data;
    const d = body.data;
    // Transform backend shape to frontend CandidateDashboard
    return {
      ...body,
      data: {
        applicationsCount: d?.applications?.total ?? 0,
        savedJobsCount: d?.savedJobsCount ?? 0,
        profileViews: d?.profileViews?.month ?? d?.profileViews ?? 0,
        profileCompleteness: d?.profileCompleteness ?? 0,
        recentApplications: d?.recentApplications ?? [],
      },
    };
  },

  async getCompleteness(): Promise<ApiResponse<ProfileCompleteness>> {
    const res = await api.get(API.CANDIDATES.COMPLETENESS);
    const body = res.data;
    const d = body.data;
    // Transform backend { percentage, completed, missing } to { score, sections }
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

  async uploadResume(file: File): Promise<ApiResponse<ResumeUploadResponse>> {
    const formData = new FormData();
    formData.append('resume', file);
    const res = await api.post(API.CANDIDATES.RESUME, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = res.data;
    return {
      ...body,
      data: {
        resume: body.data?.resume ?? '',
        resumeOriginalName: body.data?.resumeOriginalName ?? file.name,
        resumeSize: body.data?.resumeSize ?? file.size,
        resumeMimeType: body.data?.resumeMimeType ?? file.type,
        resumeUploadedAt: body.data?.resumeUploadedAt ?? new Date().toISOString(),
      },
    };
  },

  async uploadAvatar(file: File): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await api.post(API.CANDIDATES.AVATAR, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const body = res.data;
    // Backend returns { data: { profileImage: "url" } } — normalize to { url }
    return { ...body, data: { url: body.data?.profileImage ?? body.data?.url ?? '' } };
  },

  async removeAvatar(): Promise<ApiResponse<null>> {
    const res = await api.delete(API.CANDIDATES.AVATAR);
    return res.data;
  },

  async deleteResume(type: 'uploaded' | 'generated' | 'both' = 'both'): Promise<ApiResponse<null>> {
    const res = await api.delete(`${API.CANDIDATES.RESUME}?type=${type}`);
    return res.data;
  },

  async getResumeReadiness(): Promise<ApiResponse<ResumeReadiness>> {
    const res = await api.get(API.CANDIDATES.RESUME_READINESS);
    return res.data;
  },

  async generateResume(
    templateId?: string,
  ): Promise<ApiResponse<{ url: string; generatedAt: string }>> {
    const res = await api.get(API.CANDIDATES.RESUME_GENERATE, {
      params: templateId ? { template: templateId } : undefined,
    });
    return res.data;
  },

  async listResumeTemplates(): Promise<ApiResponse<ResumeTemplate[]>> {
    const res = await api.get(API.CANDIDATES.RESUME_TEMPLATES);
    return res.data;
  },

  async useGeneratedResume(): Promise<ApiResponse<{ resume: string }>> {
    const res = await api.post(API.CANDIDATES.RESUME_USE_GENERATED);
    return res.data;
  },

  async getProfileViews(): Promise<
    ApiResponse<{ views: number; recentViews: Array<{ viewerId: string; viewedAt: string }> }>
  > {
    const res = await api.get(API.CANDIDATES.PROFILE_VIEWS);
    return res.data;
  },

  async searchCandidates(
    filters: CandidateSearchFilters,
  ): Promise<PaginatedResponse<CandidateProfile>> {
    const qs = buildQueryString(filters as Record<string, string | undefined>);
    const res = await api.get(`${API.CANDIDATES.SEARCH}${qs}`);
    return res.data;
  },

  async getCandidateProfile(id: string): Promise<ApiResponse<CandidateProfile>> {
    const res = await api.get(API.CANDIDATES.DETAIL(id));
    return res.data;
  },

  async getResumeDownloadUrl(
    candidateUserId: string,
    applicationId?: string,
  ): Promise<ApiResponse<{ url: string }>> {
    const qs = applicationId ? `?applicationId=${applicationId}` : '';
    const res = await api.get(`${API.CANDIDATES.RESUME_DOWNLOAD(candidateUserId)}${qs}`);
    return res.data;
  },

  async parseResume(): Promise<ApiResponse<{ message: string }>> {
    const res = await api.post(API.CANDIDATES_EXTRA.PARSE_RESUME);
    return res.data;
  },

  async getParsedResumeData(): Promise<ApiResponse<ParsedResumeData | null>> {
    const res = await api.get(API.CANDIDATES_EXTRA.PARSED_RESUME);
    return res.data;
  },

  // Analytics
  async getAnalytics(filters?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }): Promise<ApiResponse<CandidateAnalytics>> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.CANDIDATES_EXTRA.ANALYTICS}${qs}`);
    return res.data;
  },

  async exportAnalytics(filters?: { startDate?: string; endDate?: string }): Promise<Blob> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.CANDIDATES_EXTRA.ANALYTICS_EXPORT}${qs}`, {
      responseType: 'blob',
    });
    return res.data;
  },

  // Job Alerts
  async getJobAlerts(): Promise<ApiResponse<JobAlert[]>> {
    const res = await api.get(API.CANDIDATES_EXTRA.JOB_ALERTS);
    return res.data;
  },

  async createJobAlert(data: CreateJobAlertRequest): Promise<ApiResponse<JobAlert>> {
    const res = await api.post(API.CANDIDATES_EXTRA.JOB_ALERTS, data);
    return res.data;
  },

  async updateJobAlert(id: string, data: UpdateJobAlertRequest): Promise<ApiResponse<JobAlert>> {
    const res = await api.put(API.CANDIDATES_EXTRA.JOB_ALERT_DETAIL(id), data);
    return res.data;
  },

  async deleteJobAlert(id: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.CANDIDATES_EXTRA.JOB_ALERT_DETAIL(id));
    return res.data;
  },

  async getJobAlertMatches(id: string, page = 1, limit = 20): Promise<PaginatedResponse<Job>> {
    const res = await api.get(
      `${API.CANDIDATES_EXTRA.JOB_ALERT_MATCHES(id)}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  // Profile Boost (Candidate Premium — 7-day pool, spent 1 day per activation)
  async getBoostStatus(): Promise<ApiResponse<ProfileBoostStatus>> {
    const res = await api.get(API.CANDIDATES.BOOST);
    return res.data;
  },

  async activateBoost(days?: number): Promise<ApiResponse<ActivateProfileBoostResponse>> {
    const res = await api.post(API.CANDIDATES.BOOST_ACTIVATE, { days });
    return res.data;
  },
};
