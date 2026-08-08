/**
 * Frontend client for the company-review surface.
 *
 *   Public:
 *     - submit(idOrSlug, input)
 *     - list(idOrSlug, params)
 *     - getStats(idOrSlug)
 *     - getFacets(idOrSlug)
 *     - getTopJobProfiles(idOrSlug)
 *     - searchCompaniesForForm(q)
 *     - vote(reviewId, helpful)
 *     - report(reviewId, reason, details?)
 *
 *   Candidate:
 *     - listOwn()
 *     - deleteOwn(reviewId)
 *
 *   Employer:
 *     - listEmployer(params)
 *     - getEmployerStats()
 *     - employerReport(reviewId, reason, details?)
 *
 *   Super-admin:
 *     - listAdmin(params)
 *     - moderate(reviewId, action, reason?)
 *     - listAdminForCompany(companyId, params)
 */
import api from '@/lib/api';
import type {
  Review,
  AdminReview,
  OwnReview,
  TopJobProfile,
  ReviewStatsResponse,
  ReviewFacets,
  ReviewListResponse,
  CompanyAutocompleteItem,
  SubmitReviewInput,
  ListReviewsParams,
  ModerationAction,
} from '@/types/review';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

const enc = (s: string) => encodeURIComponent(s);

function buildParams(params?: Record<string, unknown>): Record<string, string> {
  if (!params) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return out;
}

export const companyReviewService = {
  // ── Public ─────────────────────────────────────────────────────────
  async submit(
    idOrSlug: string,
    input: SubmitReviewInput,
  ): Promise<{ id: string; status: string; isDetailed: boolean }> {
    const { data } = await api.post<
      BackendEnvelope<{ id: string; status: string; isDetailed: boolean }>
    >(`/public/companies/${enc(idOrSlug)}/reviews`, input);
    return data.data;
  },

  async list(
    idOrSlug: string,
    params: ListReviewsParams = {},
  ): Promise<ReviewListResponse<Review>> {
    const { data } = await api.get<BackendEnvelope<ReviewListResponse<Review>>>(
      `/public/companies/${enc(idOrSlug)}/reviews`,
      { params: buildParams(params as Record<string, unknown>) },
    );
    return data.data;
  },

  async getStats(idOrSlug: string): Promise<ReviewStatsResponse> {
    const { data } = await api.get<BackendEnvelope<ReviewStatsResponse>>(
      `/public/companies/${enc(idOrSlug)}/reviews/stats`,
    );
    return data.data;
  },

  async getFacets(idOrSlug: string): Promise<ReviewFacets> {
    const { data } = await api.get<BackendEnvelope<ReviewFacets>>(
      `/public/companies/${enc(idOrSlug)}/reviews/facets`,
    );
    return data.data;
  },

  async getTopJobProfiles(idOrSlug: string): Promise<TopJobProfile[]> {
    const { data } = await api.get<BackendEnvelope<TopJobProfile[]>>(
      `/public/companies/${enc(idOrSlug)}/reviews/top-job-profiles`,
    );
    return data.data;
  },

  async searchCompaniesForForm(q: string): Promise<CompanyAutocompleteItem[]> {
    const { data } = await api.get<BackendEnvelope<CompanyAutocompleteItem[]>>(
      '/public/companies-autocomplete',
      { params: q ? { q } : {} },
    );
    return data.data;
  },

  async vote(
    reviewId: string,
    helpful: boolean,
  ): Promise<{ helpfulCount: number; notHelpfulCount: number; myVote: boolean | null }> {
    const { data } = await api.post<
      BackendEnvelope<{
        helpfulCount: number;
        notHelpfulCount: number;
        myVote: boolean | null;
      }>
    >(`/public/reviews/${enc(reviewId)}/vote`, { helpful });
    return data.data;
  },

  async report(
    reviewId: string,
    reason: string,
    details?: string,
  ): Promise<{ reportedCount: number; autoFlagged: boolean }> {
    const { data } = await api.post<
      BackendEnvelope<{ reportedCount: number; autoFlagged: boolean }>
    >(`/public/reviews/${enc(reviewId)}/report`, { reason, details });
    return data.data;
  },

  // ── Candidate ─────────────────────────────────────────────────────
  async listOwn(page = 1, limit = 20): Promise<ReviewListResponse<OwnReview>> {
    const { data } = await api.get<BackendEnvelope<ReviewListResponse<OwnReview>>>(
      '/candidate/reviews',
      { params: { page, limit } },
    );
    return data.data;
  },

  async deleteOwn(reviewId: string): Promise<void> {
    await api.delete(`/candidate/reviews/${enc(reviewId)}`);
  },

  // ── Employer ──────────────────────────────────────────────────────
  async listEmployer(params: ListReviewsParams = {}): Promise<ReviewListResponse<AdminReview>> {
    const { data } = await api.get<BackendEnvelope<ReviewListResponse<AdminReview>>>(
      '/employer/reviews',
      { params: buildParams(params as Record<string, unknown>) },
    );
    return data.data;
  },

  async getEmployerStats(): Promise<ReviewStatsResponse> {
    const { data } = await api.get<BackendEnvelope<ReviewStatsResponse>>('/employer/reviews/stats');
    return data.data;
  },

  async employerReport(
    reviewId: string,
    reason: string,
    details?: string,
  ): Promise<{ reportedCount: number; autoFlagged: boolean }> {
    const { data } = await api.post<
      BackendEnvelope<{ reportedCount: number; autoFlagged: boolean }>
    >(`/employer/reviews/${enc(reviewId)}/report`, { reason, details });
    return data.data;
  },

  // ── Super-admin ───────────────────────────────────────────────────
  async listAdmin(
    params: ListReviewsParams & { tab?: 'all' | 'flagged' | 'reports'; q?: string } = {},
  ): Promise<ReviewListResponse<AdminReview>> {
    const { data } = await api.get<BackendEnvelope<ReviewListResponse<AdminReview>>>(
      '/super-admin/reviews',
      { params: buildParams(params as Record<string, unknown>) },
    );
    return data.data;
  },

  async moderate(
    reviewId: string,
    action: ModerationAction,
    reason?: string,
  ): Promise<{ id: string; status: string }> {
    const { data } = await api.post<BackendEnvelope<{ id: string; status: string }>>(
      `/super-admin/reviews/${enc(reviewId)}/moderate`,
      { action, reason },
    );
    return data.data;
  },

  async listAdminForCompany(
    companyId: string,
    params: ListReviewsParams = {},
  ): Promise<ReviewListResponse<AdminReview>> {
    const { data } = await api.get<BackendEnvelope<ReviewListResponse<AdminReview>>>(
      `/super-admin/companies/${enc(companyId)}/reviews`,
      { params: buildParams(params as Record<string, unknown>) },
    );
    return data.data;
  },
};
