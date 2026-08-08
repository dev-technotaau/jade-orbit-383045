/**
 * Super-admin follow-graph service. Read-only insight into who's
 * following whom. Used by the /super-admin/follows overview page +
 * drill-down panels in user/team detail.
 */
import api from '@/lib/api';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface FollowStats {
  totals: {
    totalFollows: number;
    uniqueFollowers: number;
    uniqueFollowedCompanies: number;
  };
  topFollowedCompanies: Array<{
    followers: number;
    company: {
      id: string;
      slug?: string | null;
      companyName?: string;
      logo?: string | null;
      isVerified?: boolean;
      industry?: string | null;
    };
  }>;
  topFollowingCandidates: Array<{
    following: number;
    user: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string;
      avatar?: string | null;
      role?: string;
      candidateProfile?: {
        headline?: string | null;
        currentLocation?: string | null;
        experienceYears?: number;
      } | null;
    };
  }>;
}

export interface CompanyFollowerListResult {
  company: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
    isVerified: boolean;
  };
  items: Array<{
    followedAt: string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatar: string | null;
      role: string;
      isSuspended: boolean;
      createdAt: string;
      candidateProfile: {
        headline: string | null;
        currentRole: string | null;
        currentCompany: string | null;
        currentLocation: string | null;
        experienceYears: number;
      } | null;
    };
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface UserFollowingListResult {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
    role: string;
  };
  items: Array<{
    followedAt: string;
    company: {
      id: string;
      slug: string | null;
      companyName: string;
      logo: string | null;
      tagline: string | null;
      industry: string | null;
      isVerified: boolean;
      companyType: string | null;
      city: string | null;
      state: string | null;
      headquarters: string | null;
      openJobsCount: number;
    };
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const superAdminFollowsService = {
  async stats(): Promise<FollowStats> {
    const { data } = await api.get<BackendEnvelope<FollowStats>>('/super-admin/follows/stats');
    return data.data;
  },

  async companyFollowers(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<CompanyFollowerListResult> {
    const { data } = await api.get<BackendEnvelope<CompanyFollowerListResult>>(
      `/super-admin/follows/companies/${companyId}/followers`,
      { params: { page, limit } },
    );
    return data.data;
  },

  async userFollowing(userId: string, page = 1, limit = 20): Promise<UserFollowingListResult> {
    const { data } = await api.get<BackendEnvelope<UserFollowingListResult>>(
      `/super-admin/follows/users/${userId}/following`,
      { params: { page, limit } },
    );
    return data.data;
  },
};
