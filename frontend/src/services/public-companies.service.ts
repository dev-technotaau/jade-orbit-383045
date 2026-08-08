/**
 * Frontend client for /api/v1/public/companies.
 */
import api from '@/lib/api';

export interface PublicCompanyCardData {
  id: string;
  slug: string | null;
  companyName: string;
  tagline?: string | null;
  logo?: string | null;
  industry?: string | null;
  companySize?: string | null;
  city?: string | null;
  state?: string | null;
  headquarters?: string | null;
  isVerified?: boolean | null;
  companyType?: string | null;
  openJobsCount?: number;
  /** Optional — backend attaches when an aggregate row exists. */
  averageRating?: number;
  /** Optional — backend attaches when an aggregate row exists. */
  totalReviews?: number;
}

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface PublicCompanySearchResult {
  items: PublicCompanyCardData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    cap?: number;
    loginRequired?: boolean;
  };
}

export interface PublicCompanyDetailResult {
  company: PublicCompanyCardData & {
    description?: string | null;
    website?: string | null;
    foundedYear?: number | null;
    locations?: string[];
    benefits?: string[];
    coreValues?: string[];
    techStack?: string[];
    productsServices?: string[];
    specialties?: string[];
    awardsRecognitions?: unknown;
    leadershipTeam?: unknown;
    employeeTestimonials?: unknown;
    officePhotos?: unknown;
    socialLinks?: unknown;
    coverImage?: string | null;
    companyVideoUrl?: string | null;
    missionStatement?: string | null;
    visionStatement?: string | null;
    /** "Why work with us" editorial pitch — drives a dedicated tab. */
    whyWorkForUs?: string | null;
    companyCulture?: string | null;
    diversityStatement?: string | null;
    csrInitiatives?: string | null;
    interviewProcess?: string | null;
    workplacePolicies?: unknown;
    structuredPerks?: unknown;
    fundingStage?: string | null;
    investors?: string[];
    annualRevenueRange?: string | null;
  };
  jobs: Array<{
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
    salaryNotDisclosed?: boolean;
    currency?: string | null;
    createdAt: string;
    isFeatured?: boolean | null;
    isPremium?: boolean | null;
    urgencyLevel?: string | null;
  }>;
  openJobsCount: number;
}

export const publicCompaniesService = {
  async search(
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<PublicCompanySearchResult> {
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') cleaned[k] = v;
    }
    const { data } = await api.get<BackendEnvelope<PublicCompanySearchResult>>(
      '/public/companies',
      { params: cleaned },
    );
    return data?.data ?? { items: [], pagination: { page: 1, limit: 20, total: 0 } };
  },

  async detail(slug: string): Promise<PublicCompanyDetailResult> {
    const { data } = await api.get<BackendEnvelope<PublicCompanyDetailResult>>(
      `/public/companies/${encodeURIComponent(slug)}`,
    );
    return data.data;
  },

  async companyJobs(slug: string, params: CompanyJobsParams = {}): Promise<CompanyJobsResult> {
    const cleaned: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') cleaned[k] = v;
    }
    const { data } = await api.get<BackendEnvelope<CompanyJobsResult>>(
      `/public/companies/${encodeURIComponent(slug)}/jobs`,
      { params: cleaned },
    );
    return (
      data?.data ?? {
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        facets: {
          jobType: [],
          workMode: [],
          location: [],
          experienceLevel: [],
          department: [],
        },
      }
    );
  },
};

export interface CompanyJobsParams {
  jobType?: string;
  workMode?: string;
  location?: string;
  experienceLevel?: string;
  department?: string;
  page?: number;
  limit?: number;
}

export interface CompanyJobsFacetBucket {
  value: string;
  count: number;
}

export interface CompanyJobsResult {
  items: PublicCompanyDetailResult['jobs'];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  facets: {
    jobType: CompanyJobsFacetBucket[];
    workMode: CompanyJobsFacetBucket[];
    location: CompanyJobsFacetBucket[];
    experienceLevel: CompanyJobsFacetBucket[];
    department: CompanyJobsFacetBucket[];
  };
}
