export type EntitlementStatus = 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED' | 'ON_HOLD';

export type EntitlementSource =
  | 'PLAN'
  | 'BONUS'
  | 'MANUAL'
  | 'REFUND_CREDIT'
  | 'COUPON'
  | 'MIGRATION';

export type ResourceUnit =
  | 'JOB_POST'
  | 'JOB_DAYS_LIVE'
  | 'APPLICATIONS'
  | 'CV_UNLOCK'
  | 'SEARCH_RESULT'
  | 'MATCHED_PROFILE_EMAIL'
  | 'FEATURE_FLAG'
  | 'SEAT'
  | 'BOOST_DAYS'
  | 'VENDOR_LEAD'
  | 'CUSTOM';

export type PlanFeatureKind = 'COUNTABLE' | 'BOOLEAN' | 'ENUM' | 'TEXT';

export interface ResolvedFeature {
  key: string;
  label: string;
  kind: PlanFeatureKind;
  included: boolean;
  countableLimit: number | null;
  enumValue: string | null;
  textValue: string | null;
}

export interface ResolvedResource {
  unit: ResourceUnit;
  allocated: number;
  consumed: number;
  carriedForward: number;
  remaining: number;
  totalAllocated: number;
  totalConsumed: number;
  totalRemaining: number;
  /** ISO timestamp of the last consume/release on this resource. */
  lastConsumedAt: string | null;
}

export interface ResolvedEntitlement {
  id: string;
  planId: string;
  planCode: string;
  planName: string;
  /** Plan family (JOB_POST / CV_DATABASE / ...). Optional: snapshots
   *  cached before this field shipped lack it for up to 60s. */
  planCategory?: string;
  /** Base price of the granting plan — 0 = free tier. Same caveat. */
  planPricePaise?: number;
  source: EntitlementSource;
  validFrom: string;
  validUntil: string;
  autoRenew: boolean;
  gracePeriodUntil: string | null;
  cancelledAt: string | null;
  status: EntitlementStatus;
  features: ResolvedFeature[];
  resources: ResolvedResource[];
  /** Free-form metadata persisted on the Entitlement row. */
  metadata: Record<string, unknown> | null;
}

export interface EntitlementSnapshot {
  entitlements: ResolvedEntitlement[];
  features: Record<string, boolean>;
  resources: Partial<Record<ResourceUnit, ResolvedResource>>;
  nextExpiryAt: string | null;
  hasAnyActive: boolean;
}

/** Common feature keys — typed for autocomplete in PlanGate `require={...}`. */
export const FEATURE_KEYS = {
  // Employer
  JOB_POST: 'feature.job_post',
  CV_DB_ACCESS: 'feature.cv_db_access',
  CV_UNLOCK: 'feature.cv_unlock',
  ADVANCED_FILTERS: 'feature.advanced_filters',
  CONTACT_DETAILS: 'feature.contact_details',
  BULK_DOWNLOAD: 'feature.bulk_download',
  MULTI_SEAT: 'feature.multi_seat',
  TOP_LISTING_BOOST: 'feature.top_listing_boost',
  TOP_SEARCH_VISIBILITY: 'feature.top_search_visibility',
  UNLIMITED_APPLICATIONS: 'feature.unlimited_applications',
  URGENT_HIRING_BADGE: 'feature.urgent_hiring_badge',
  // Vendor
  VENDOR_LEADS: 'feature.vendor_leads',
  VENDOR_LISTING: 'feature.vendor_listing',
  VENDOR_PRIORITY_LEADS: 'feature.vendor_priority_leads',
  // Assisted hiring
  ASSISTED_HIRING: 'feature.assisted_hiring',
  // Candidate
  CANDIDATE_AI_RESUME_PREMIUM: 'feature.candidate_ai_resume_premium',
  CANDIDATE_VERIFIED_BADGE: 'feature.candidate_verified_badge',
  CANDIDATE_PROFILE_BOOST: 'feature.candidate_profile_boost',
  CANDIDATE_TOP_VISIBILITY: 'feature.candidate_top_visibility',
  // Cross-cutting
  WHATSAPP_PRIORITY: 'feature.whatsapp_priority',
  PRIORITY_SUPPORT: 'feature.priority_support',
} as const;
