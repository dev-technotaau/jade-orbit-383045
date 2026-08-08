/**
 * Billing types — mirror of `backend/src/types/billing.types.ts` and the
 * Prisma enums. Kept in sync by hand. When backend types change, update
 * here and run `npm run type-check` on both sides.
 */

export type PlanCategory =
  | 'CANDIDATE_PREMIUM'
  | 'EMPLOYER_JOB_POST'
  | 'EMPLOYER_CV_DATABASE'
  | 'EMPLOYER_ASSISTED_HIRING'
  | 'VENDOR_CONNECT'
  | 'EMPLOYER_CV_ENTERPRISE_CUSTOM';

export type PlanBillingCycle =
  | 'ONE_TIME'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'CUSTOM';

export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'HIDDEN';

export type PlanFeatureKind = 'COUNTABLE' | 'BOOLEAN' | 'ENUM' | 'TEXT';

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

export interface PlanFeature {
  key: string;
  label: string;
  kind: PlanFeatureKind;
  countableLimit?: number | null;
  enumValue?: string | null;
  textValue?: string | null;
  included: boolean;
  displayOrder: number;
  description?: string | null;
}

export interface PlanResource {
  unit: ResourceUnit;
  quantity: number;
  perPeriodReset?: boolean;
  carryForwardCap?: number | null;
  notes?: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  slug: string;
  category: PlanCategory;
  billingCycle: PlanBillingCycle;
  status: PlanStatus;
  basePricePaise: number;
  currency: string;
  gstRatePercent: number;
  gstInclusive: boolean;
  hsnCode: string | null;
  validityDays: number | null;
  trialDays: number;
  displayOrder: number;
  highlight: boolean;
  badgeText: string | null;
  shortDescription: string | null;
  descriptionHtml: string | null;
  isCustom: boolean;
  requiresQuote: boolean;
  /** Razorpay subscription plan id — only set on subscription-cycle plans (e.g. VENDOR_CONNECT). */
  razorpayPlanId: string | null;
  features: PlanFeature[];
  resources: PlanResource[];
}

export interface AdminPlan extends Plan {
  isPublic: boolean;
  razorpayPlanId: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export type PlanCategoryGroupKey =
  | 'EMPLOYER_JOB_POST'
  | 'EMPLOYER_CV_DATABASE'
  | 'EMPLOYER_ASSISTED_HIRING'
  | 'VENDOR_CONNECT'
  | 'CANDIDATE_PREMIUM';

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  CANDIDATE_PREMIUM: 'For Candidates',
  EMPLOYER_JOB_POST: 'Job Posting',
  EMPLOYER_CV_DATABASE: 'CV Database',
  EMPLOYER_ASSISTED_HIRING: 'Assisted Hiring',
  VENDOR_CONNECT: 'Vendor Connect',
  EMPLOYER_CV_ENTERPRISE_CUSTOM: 'Enterprise',
};

export const PLAN_BILLING_LABELS: Record<PlanBillingCycle, string> = {
  ONE_TIME: 'one-time',
  MONTHLY: '/ month',
  QUARTERLY: '/ quarter',
  HALF_YEARLY: '/ half-year',
  YEARLY: '/ year',
  CUSTOM: 'custom',
};

/** Format paise as Indian currency (₹X,YYY). */
export function formatPaise(paise: number, currency = 'INR'): string {
  if (currency !== 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(paise / 100);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
