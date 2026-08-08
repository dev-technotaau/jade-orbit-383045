import api from '@/lib/api';
import type { VendorLeadStatus } from '@/services/vendor.service';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface SaVendorRow {
  id: string;
  slug: string;
  userId: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  logo: string | null;
  isVerified: boolean;
  isPublic: boolean;
  createdAt: string;
  services: string[];
  locations: string[];
  user: { email: string };
  leadCount: number;
  avgRating: number | null;
  reviewCount: number;
  hasActiveSub: boolean;
}

export interface SaVendorListResponse {
  items: SaVendorRow[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface SaVendorLead {
  id: string;
  status: VendorLeadStatus;
  requirementText: string;
  contactEmail: string;
  contactPhone: string | null;
  responseText: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  jobPost?: { id: string; title: string } | null;
  employer?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface SaVendorReview {
  id: string;
  rating: number;
  text: string | null;
  verified: boolean;
  createdAt: string;
  reviewer?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface SaVendorDetail {
  vendor: {
    id: string;
    userId: string;
    slug: string;
    businessName: string;
    description: string | null;
    logo: string | null;
    website: string | null;
    contactEmail: string;
    contactPhone: string;
    services: string[];
    industries: string[];
    locations: string[];
    yearsInBusiness: number | null;
    teamSize: number | null;
    isVerified: boolean;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
    };
  };
  leads: SaVendorLead[];
  reviews: SaVendorReview[];
  leadCounts: Record<VendorLeadStatus, number>;
  ratingStats: { avg: number | null; count: number };
  activeSubscription: {
    id: string;
    validUntil: string;
    plan: { name: string; code: string };
  } | null;
  /** Job-board employer contacts this vendor revealed (each spent 1 lead). */
  contactReveals: SaVendorContactReveal[];
  revealCount: number;
  savedCount: number;
  /**
   * Set when leads/reviews EXIST but were withheld because the caller lacks
   * `vendors.leads` / `vendors.reviews.view`. Both arrays arrive empty in
   * that case, so without these an over-scoped page would read "No leads
   * received" — a factual claim about the business that happens to be false.
   */
  leadsRedacted?: boolean;
  reviewsRedacted?: boolean;
}

export interface SaVendorContactReveal {
  jobPostId: string | null;
  jobTitle: string | null;
  jobSlug: string | null;
  companyName: string | null;
  revealedAt: string;
}

export interface SaTeamVendorAnalytics {
  teams: {
    totalCompanies: number;
    companiesWithMultiSeat: number;
    activeSeats: number;
    pendingInvites: number;
    topByConsumption: Array<{
      userId: string;
      email: string;
      name: string;
      consumed: number;
    }>;
  };
  vendors: {
    totalVendors: number;
    verifiedVendors: number;
    publicVendors: number;
    activeSubscriptions: number;
    avgRating: number | null;
    reviewCount: number;
    totalLeadReveals: number;
    leadsByStatus: Record<string, number>;
    topByLeads: Array<{
      vendorProfileId: string;
      slug: string;
      businessName: string;
      isVerified: boolean;
      leadCount: number;
    }>;
  };
}

export const superAdminVendorsService = {
  async list(
    args: {
      query?: string;
      isVerified?: boolean;
      isPublic?: boolean;
      hasActiveSub?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<SaVendorListResponse> {
    const { data } = await api.get<BackendEnvelope<SaVendorListResponse>>('/super-admin/vendors', {
      params: args,
    });
    return data.data;
  },

  async detail(id: string): Promise<SaVendorDetail> {
    const { data } = await api.get<BackendEnvelope<SaVendorDetail>>(
      `/super-admin/vendors/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  async setVerified(id: string, isVerified: boolean): Promise<SaVendorDetail['vendor']> {
    const { data } = await api.patch<BackendEnvelope<SaVendorDetail['vendor']>>(
      `/super-admin/vendors/${encodeURIComponent(id)}/verify`,
      { isVerified },
    );
    return data.data;
  },

  async setVisibility(
    id: string,
    isPublic: boolean,
    reason?: string,
  ): Promise<SaVendorDetail['vendor']> {
    const { data } = await api.patch<BackendEnvelope<SaVendorDetail['vendor']>>(
      `/super-admin/vendors/${encodeURIComponent(id)}/visibility`,
      { isPublic, reason },
    );
    return data.data;
  },

  async deleteReview(reviewId: string, reason?: string): Promise<void> {
    await api.delete(`/super-admin/vendors/reviews/${encodeURIComponent(reviewId)}`, {
      data: { reason },
    });
  },

  async analytics(): Promise<SaTeamVendorAnalytics> {
    const { data } = await api.get<BackendEnvelope<SaTeamVendorAnalytics>>(
      '/super-admin/vendors/analytics',
    );
    return data.data;
  },
};

export default superAdminVendorsService;
