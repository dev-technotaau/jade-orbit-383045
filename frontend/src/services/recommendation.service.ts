import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Job } from '@/types/job';

export interface RecommendedCandidate {
  id: string;
  userId: string;
  headline: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  experienceYears: number;
  skills: string[];
  currentLocation: string | null;
  matchScore?: number;
  user?: {
    firstName: string | null;
    lastName: string | null;
  };
}

export const recommendationService = {
  async getRecommendedJobs(): Promise<PaginatedResponse<Job>> {
    const res = await api.get(API.RECOMMENDATIONS.JOBS);
    return res.data;
  },

  async getRecommendationFeed(filters?: {
    workMode?: string;
    type?: string;
    experienceLevel?: string;
    page?: string;
    limit?: string;
  }): Promise<PaginatedResponse<Job>> {
    const qs = filters ? buildQueryString(filters as Record<string, string | undefined>) : '';
    const res = await api.get(`${API.RECOMMENDATIONS.JOBS}${qs}`);
    return res.data;
  },

  async dismissRecommendation(jobId: string): Promise<ApiResponse<null>> {
    const res = await api.post(API.RECOMMENDATIONS.DISMISS_JOB(jobId));
    return res.data;
  },

  async getRecommendedCandidates(jobId: string): Promise<ApiResponse<RecommendedCandidate[]>> {
    const res = await api.get(API.RECOMMENDATIONS.CANDIDATES(jobId));
    return res.data;
  },

  async getRecommendedCandidatesForEmployer(
    limit = 10,
  ): Promise<ApiResponse<RecommendedCandidate[]>> {
    const res = await api.get(`${API.RECOMMENDATIONS.CANDIDATES_FOR_EMPLOYER}?limit=${limit}`);
    return res.data;
  },
};
