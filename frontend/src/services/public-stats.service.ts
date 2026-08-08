/**
 * Frontend client for the public-stats discovery aggregates.
 *
 *   - getCompanyCategoryStats() → Section 2 of the homepage.
 *   - getFeaturedCompanies()    → Section 3 of the homepage.
 *   - getRoleCounts(roles)      → Section 4 of the homepage.
 *
 * All endpoints are 30–60-min Redis-cached on the backend, so calling
 * these from a TanStack Query with a 10-min staleTime is plenty fresh.
 */
import api from '@/lib/api';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface CompanyCategoryStat {
  slug: string;
  label: string;
  href: string;
  totalCompanies: number;
  sampleLogos: string[];
  /** Weighted average rating across companies in this category — null when no reviews yet. */
  averageRating?: number | null;
  /** Sum of reviews across companies in the category. */
  totalReviews?: number;
}

export interface FeaturedCompany {
  id: string;
  slug: string;
  companyName: string;
  logo: string | null;
  tagline: string | null;
  industry: string | null;
  isVerified: boolean;
  openJobsCount: number;
  recentActivityScore: number;
  /** Optional — present when the backend has a rating aggregate row. */
  averageRating?: number;
  /** Optional — present when the backend has a rating aggregate row. */
  totalReviews?: number;
}

export interface RoleCount {
  role: string;
  count: number;
}

export const publicStatsService = {
  async companyCategoryStats(): Promise<CompanyCategoryStat[]> {
    const { data } = await api.get<BackendEnvelope<{ items: CompanyCategoryStat[] }>>(
      '/public/company-categories/stats',
    );
    return data.data.items;
  },

  async featuredCompanies(limit = 15): Promise<FeaturedCompany[]> {
    const { data } = await api.get<BackendEnvelope<{ items: FeaturedCompany[] }>>(
      '/public/companies/featured',
      { params: { limit } },
    );
    return data.data.items;
  },

  async roleCounts(roles: string[]): Promise<RoleCount[]> {
    if (!roles.length) return [];
    const { data } = await api.get<BackendEnvelope<{ items: RoleCount[] }>>('/public/role-counts', {
      params: { roles: roles.join(',') },
    });
    return data.data.items;
  },
};
