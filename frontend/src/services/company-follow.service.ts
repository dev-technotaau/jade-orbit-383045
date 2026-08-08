/**
 * Frontend client for the company-follow surface.
 *
 *   - getStatus(slug)       — { isFollowing, followersCount }
 *   - follow(slug)          — auth, candidate-only
 *   - unfollow(slug)        — auth, candidate-only
 *   - listFollowing()       — candidate's followed companies
 *   - listFollowedJobs()    — aggregated job feed from followed companies
 *   - listFollowers()       — employer's own followers
 */
import api from '@/lib/api';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface FollowStatus {
  isFollowing: boolean;
  followersCount: number;
}

export interface FollowedCompanyItem {
  followedAt: string;
  company: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
    tagline: string | null;
    industry: string | null;
    companySize: string | null;
    isVerified: boolean;
    city: string | null;
    state: string | null;
    headquarters: string | null;
    companyType: string | null;
    openJobsCount: number;
    /** Optional — present when backend has a review aggregate row. */
    averageRating?: number;
    /** Optional — present when backend has a review aggregate row. */
    totalReviews?: number;
  };
}

export interface FollowedCompanyJob {
  id: string;
  slug: string | null;
  title: string;
  location: string;
  workMode?: string | null;
  experienceMin?: number;
  experienceMax?: number | null;
  type?: string | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryDisclosed?: boolean;
  currency?: string | null;
  createdAt: string;
  isFeatured?: boolean | null;
  isPremium?: boolean | null;
  urgencyLevel?: string | null;
  company: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
    isVerified: boolean;
  };
}

export interface FollowerItem {
  followedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
    candidateProfile: {
      headline: string | null;
      currentRole: string | null;
      currentCompany: string | null;
      experienceYears: number;
      currentLocation: string | null;
    } | null;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const companyFollowService = {
  async getStatus(idOrSlug: string): Promise<FollowStatus> {
    const { data } = await api.get<BackendEnvelope<FollowStatus>>(
      `/companies/${encodeURIComponent(idOrSlug)}/follow-status`,
    );
    return data.data;
  },

  async follow(idOrSlug: string): Promise<FollowStatus> {
    const { data } = await api.post<BackendEnvelope<FollowStatus>>(
      `/companies/${encodeURIComponent(idOrSlug)}/follow`,
    );
    return data.data;
  },

  async unfollow(idOrSlug: string): Promise<FollowStatus> {
    const { data } = await api.delete<BackendEnvelope<FollowStatus>>(
      `/companies/${encodeURIComponent(idOrSlug)}/follow`,
    );
    return data.data;
  },

  async listFollowing(
    page = 1,
    limit = 20,
    opts: { q?: string; sort?: 'recent' | 'name' | 'open_jobs' } = {},
  ): Promise<PaginatedResult<FollowedCompanyItem>> {
    const params: Record<string, string | number> = { page, limit };
    if (opts.q) params.q = opts.q;
    if (opts.sort) params.sort = opts.sort;
    const { data } = await api.get<BackendEnvelope<PaginatedResult<FollowedCompanyItem>>>(
      '/candidate/following/companies',
      { params },
    );
    return data.data;
  },

  async listFollowedJobs(page = 1, limit = 20): Promise<PaginatedResult<FollowedCompanyJob>> {
    const { data } = await api.get<BackendEnvelope<PaginatedResult<FollowedCompanyJob>>>(
      '/candidate/following/jobs',
      { params: { page, limit } },
    );
    return data.data;
  },

  async listFollowers(
    page = 1,
    limit = 20,
    opts: { q?: string; sort?: 'recent' | 'name' } = {},
  ): Promise<PaginatedResult<FollowerItem>> {
    const params: Record<string, string | number> = { page, limit };
    if (opts.q) params.q = opts.q;
    if (opts.sort) params.sort = opts.sort;
    const { data } = await api.get<BackendEnvelope<PaginatedResult<FollowerItem>>>(
      '/employer/followers',
      { params },
    );
    return data.data;
  },
};
