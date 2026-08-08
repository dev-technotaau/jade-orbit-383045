/**
 * Frontend client for /api/v1/public/jobs.
 * Anonymous-allowed; the axios client passes auth cookies when present
 * so authenticated users get the same surface without the guest cap.
 */
import api from '@/lib/api';
import type { PublicJobCardData } from '@/components/job-search/PublicJobCard';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface PublicJobSearchResult {
  items: PublicJobCardData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    cap?: number;
    loginRequired?: boolean;
  };
}

export interface PublicJobDetailResult {
  job: PublicJobCardData & {
    keyResponsibilities?: string;
    requirements?: string;
    benefits?: string;
    company?: PublicJobCardData['company'] & {
      tagline?: string | null;
      industry?: string | null;
      companySize?: string | null;
      city?: string | null;
      headquarters?: string | null;
      website?: string | null;
    };
    screeningQuestions?: Array<{
      id: string;
      question: string;
      questionType: string;
      isRequired: boolean;
      options?: unknown;
      displayOrder: number;
    }>;
  };
  related: PublicJobCardData[];
}

export const publicJobsService = {
  async search(
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<PublicJobSearchResult> {
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') cleaned[k] = v;
    }
    const { data } = await api.get<BackendEnvelope<PublicJobSearchResult>>('/public/jobs', {
      params: cleaned,
    });
    return data?.data ?? { items: [], pagination: { page: 1, limit: 20, total: 0 } };
  },

  async detail(slug: string): Promise<PublicJobDetailResult> {
    const { data } = await api.get<BackendEnvelope<PublicJobDetailResult>>(
      `/public/jobs/${encodeURIComponent(slug)}`,
    );
    return data.data;
  },
};
