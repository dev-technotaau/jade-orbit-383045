import type {
  PlanCategory,
  PlanBillingCycle,
  PlanStatus,
  PlanFeatureKind,
  ResourceUnit,
} from '@prisma/client';

/**
 * Plan feature DTO — what the API exposes (versus the raw Prisma row).
 */
export interface PlanFeatureDTO {
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

export interface PlanResourceDTO {
  unit: ResourceUnit;
  quantity: number;
  perPeriodReset?: boolean;
  carryForwardCap?: number | null;
  notes?: string | null;
}

/**
 * Public plan listing — what unauthenticated users see on `/pricing`.
 * Excludes internal fields (createdById, internalNotes, metadata).
 */
export interface PublicPlanDTO {
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
  features: PlanFeatureDTO[];
  resources: PlanResourceDTO[];
}

export interface AdminPlanDTO extends PublicPlanDTO {
  isPublic: boolean;
  razorpayPlanId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanInput {
  code: string;
  name: string;
  slug?: string;
  category: PlanCategory;
  billingCycle: PlanBillingCycle;
  basePricePaise: number;
  currency?: string;
  gstRatePercent?: number;
  gstInclusive?: boolean;
  hsnCode?: string;
  validityDays?: number | null;
  trialDays?: number;
  displayOrder?: number;
  highlight?: boolean;
  badgeText?: string | null;
  shortDescription?: string | null;
  descriptionHtml?: string | null;
  status?: PlanStatus;
  isPublic?: boolean;
  isCustom?: boolean;
  requiresQuote?: boolean;
  razorpayPlanId?: string | null;
  features?: PlanFeatureDTO[];
  resources?: PlanResourceDTO[];
  metadata?: unknown;
}

export type UpdatePlanInput = Partial<CreatePlanInput>;

export interface PlanCatalogQuery {
  category?: PlanCategory;
  status?: PlanStatus;
  isPublic?: boolean;
  includeArchived?: boolean;
}
