import { prisma } from '../config/prisma';
import { Prisma, PlanStatus, type Plan } from '@prisma/client';
import { AppError, NotFoundError, ConflictError } from '../exceptions';
import logger from '../config/logger';
import type {
  CreatePlanInput,
  UpdatePlanInput,
  PlanCatalogQuery,
  PublicPlanDTO,
  AdminPlanDTO,
  PlanFeatureDTO,
  PlanResourceDTO,
} from '../types/billing.types';

type PlanWithRelations = Plan & {
  features: Array<{
    key: string;
    label: string;
    kind: PlanFeatureDTO['kind'];
    countableLimit: number | null;
    enumValue: string | null;
    textValue: string | null;
    included: boolean;
    displayOrder: number;
    description: string | null;
  }>;
  resources: Array<{
    unit: PlanResourceDTO['unit'];
    quantity: number;
    perPeriodReset: boolean;
    carryForwardCap: number | null;
    notes: string | null;
  }>;
};

const DEFAULT_INCLUDE = {
  features: { orderBy: { displayOrder: 'asc' as const } },
  resources: true,
} satisfies Prisma.PlanInclude;

/**
 * Generate a slug from a plan code if not explicitly provided.
 * `EMP_PREMIUM` -> `emp-premium`.
 */
function deriveSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

function toPublicDTO(plan: PlanWithRelations): PublicPlanDTO {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    slug: plan.slug,
    category: plan.category,
    billingCycle: plan.billingCycle,
    status: plan.status,
    basePricePaise: plan.basePricePaise,
    currency: plan.currency,
    gstRatePercent: plan.gstRatePercent,
    gstInclusive: plan.gstInclusive,
    hsnCode: plan.hsnCode,
    validityDays: plan.validityDays,
    trialDays: plan.trialDays,
    displayOrder: plan.displayOrder,
    highlight: plan.highlight,
    badgeText: plan.badgeText,
    shortDescription: plan.shortDescription,
    descriptionHtml: plan.descriptionHtml,
    isCustom: plan.isCustom,
    requiresQuote: plan.requiresQuote,
    features: plan.features,
    resources: plan.resources,
  };
}

function toAdminDTO(plan: PlanWithRelations): AdminPlanDTO {
  return {
    ...toPublicDTO(plan),
    isPublic: plan.isPublic,
    razorpayPlanId: plan.razorpayPlanId,
    metadata: plan.metadata as unknown,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

// ===========================================================
// Read APIs
// ===========================================================

export async function listPublicPlans(query: PlanCatalogQuery = {}): Promise<PublicPlanDTO[]> {
  const where: Prisma.PlanWhereInput = {
    isPublic: true,
    status: query.status ?? PlanStatus.ACTIVE,
  };
  if (query.category) where.category = query.category;
  const plans = await prisma.plan.findMany({
    where,
    include: DEFAULT_INCLUDE,
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { basePricePaise: 'asc' }],
  });
  return plans.map(toPublicDTO);
}

export async function getPublicPlanByCode(code: string): Promise<PublicPlanDTO | null> {
  const plan = await prisma.plan.findFirst({
    where: { code, isPublic: true },
    include: DEFAULT_INCLUDE,
  });
  return plan ? toPublicDTO(plan) : null;
}

export async function getPublicPlanBySlug(slug: string): Promise<PublicPlanDTO | null> {
  const plan = await prisma.plan.findFirst({
    where: { slug, isPublic: true },
    include: DEFAULT_INCLUDE,
  });
  return plan ? toPublicDTO(plan) : null;
}

export async function listPlansAdmin(query: PlanCatalogQuery = {}): Promise<AdminPlanDTO[]> {
  const where: Prisma.PlanWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (typeof query.isPublic === 'boolean') where.isPublic = query.isPublic;
  if (!query.includeArchived) where.status = where.status ?? { not: PlanStatus.ARCHIVED };
  const plans = await prisma.plan.findMany({
    where,
    include: DEFAULT_INCLUDE,
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
  });
  return plans.map(toAdminDTO);
}

export async function getPlanByIdAdmin(id: string): Promise<AdminPlanDTO> {
  const plan = await prisma.plan.findUnique({ where: { id }, include: DEFAULT_INCLUDE });
  if (!plan) throw new NotFoundError('Plan not found');
  return toAdminDTO(plan);
}

export async function getPlanByCodeAdmin(code: string): Promise<AdminPlanDTO> {
  const plan = await prisma.plan.findUnique({ where: { code }, include: DEFAULT_INCLUDE });
  if (!plan) throw new NotFoundError('Plan not found');
  return toAdminDTO(plan);
}

// Returns the raw plan (with relations) — used by order/billing services
export async function getActivePlanByCodeRaw(code: string): Promise<PlanWithRelations | null> {
  return prisma.plan.findFirst({
    where: { code, status: PlanStatus.ACTIVE },
    include: DEFAULT_INCLUDE,
  });
}

export async function getActivePlanByIdRaw(id: string): Promise<PlanWithRelations | null> {
  return prisma.plan.findFirst({
    where: { id, status: PlanStatus.ACTIVE },
    include: DEFAULT_INCLUDE,
  });
}

// ===========================================================
// Write APIs
// ===========================================================

export async function createPlan(
  input: CreatePlanInput,
  createdById?: string
): Promise<AdminPlanDTO> {
  const slug = input.slug ?? deriveSlug(input.code);
  const existing = await prisma.plan.findFirst({
    where: { OR: [{ code: input.code }, { slug }] },
  });
  if (existing) throw new ConflictError(`Plan with code "${input.code}" or slug "${slug}" exists`);

  const plan = await prisma.plan.create({
    data: {
      code: input.code,
      name: input.name,
      slug,
      category: input.category,
      billingCycle: input.billingCycle,
      basePricePaise: input.basePricePaise,
      currency: input.currency ?? 'INR',
      gstRatePercent: input.gstRatePercent ?? 18,
      gstInclusive: input.gstInclusive ?? true,
      hsnCode: input.hsnCode ?? '998314',
      validityDays: input.validityDays ?? null,
      trialDays: input.trialDays ?? 0,
      displayOrder: input.displayOrder ?? 100,
      highlight: input.highlight ?? false,
      badgeText: input.badgeText ?? null,
      shortDescription: input.shortDescription ?? null,
      descriptionHtml: input.descriptionHtml ?? null,
      status: input.status ?? PlanStatus.DRAFT,
      isPublic: input.isPublic ?? true,
      isCustom: input.isCustom ?? false,
      requiresQuote: input.requiresQuote ?? false,
      razorpayPlanId: input.razorpayPlanId ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      createdById: createdById ?? null,
      features: input.features
        ? {
            create: input.features.map((f) => ({
              key: f.key,
              label: f.label,
              kind: f.kind,
              countableLimit: f.countableLimit ?? null,
              enumValue: f.enumValue ?? null,
              textValue: f.textValue ?? null,
              included: f.included ?? true,
              displayOrder: f.displayOrder ?? 100,
              description: f.description ?? null,
            })),
          }
        : undefined,
      resources: input.resources
        ? {
            create: input.resources.map((r) => ({
              unit: r.unit,
              quantity: r.quantity,
              perPeriodReset: r.perPeriodReset ?? true,
              carryForwardCap: r.carryForwardCap ?? null,
              notes: r.notes ?? null,
            })),
          }
        : undefined,
    },
    include: DEFAULT_INCLUDE,
  });
  logger.info('Plan created', { planId: plan.id, code: plan.code });
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_PLAN_CREATED',
      entity: 'Plan',
      entityId: plan.id,
      performedBy: createdById ?? 'system',
      details: {
        code: plan.code,
        name: plan.name,
        category: plan.category,
        basePricePaise: plan.basePricePaise,
      },
    });
  })();
  return toAdminDTO(plan);
}

export async function updatePlan(
  id: string,
  input: UpdatePlanInput,
  publishedById?: string
): Promise<AdminPlanDTO> {
  const existing = await prisma.plan.findUnique({ where: { id }, include: DEFAULT_INCLUDE });
  if (!existing) throw new NotFoundError('Plan not found');

  // Detect significant changes for versioning
  const significant =
    input.basePricePaise !== undefined ||
    input.gstRatePercent !== undefined ||
    input.validityDays !== undefined ||
    input.features !== undefined ||
    input.resources !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.PlanUpdateInput = {};
    if (input.code) data.code = input.code;
    if (input.name) data.name = input.name;
    if (input.slug) data.slug = input.slug;
    if (input.category) data.category = input.category;
    if (input.billingCycle) data.billingCycle = input.billingCycle;
    if (input.basePricePaise !== undefined) data.basePricePaise = input.basePricePaise;
    if (input.currency) data.currency = input.currency;
    if (input.gstRatePercent !== undefined) data.gstRatePercent = input.gstRatePercent;
    if (input.gstInclusive !== undefined) data.gstInclusive = input.gstInclusive;
    if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode;
    if (input.validityDays !== undefined) data.validityDays = input.validityDays;
    if (input.trialDays !== undefined) data.trialDays = input.trialDays;
    if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
    if (input.highlight !== undefined) data.highlight = input.highlight;
    if (input.badgeText !== undefined) data.badgeText = input.badgeText;
    if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription;
    if (input.descriptionHtml !== undefined) data.descriptionHtml = input.descriptionHtml;
    if (input.status !== undefined) data.status = input.status;
    if (input.isPublic !== undefined) data.isPublic = input.isPublic;
    if (input.isCustom !== undefined) data.isCustom = input.isCustom;
    if (input.requiresQuote !== undefined) data.requiresQuote = input.requiresQuote;
    if (input.razorpayPlanId !== undefined) data.razorpayPlanId = input.razorpayPlanId;
    if (input.metadata !== undefined) data.metadata = input.metadata as Prisma.InputJsonValue;

    if (input.features) {
      await tx.planFeature.deleteMany({ where: { planId: id } });
      await tx.planFeature.createMany({
        data: input.features.map((f) => ({
          planId: id,
          key: f.key,
          label: f.label,
          kind: f.kind,
          countableLimit: f.countableLimit ?? null,
          enumValue: f.enumValue ?? null,
          textValue: f.textValue ?? null,
          included: f.included ?? true,
          displayOrder: f.displayOrder ?? 100,
          description: f.description ?? null,
        })),
      });
    }
    if (input.resources) {
      await tx.planResource.deleteMany({ where: { planId: id } });
      await tx.planResource.createMany({
        data: input.resources.map((r) => ({
          planId: id,
          unit: r.unit,
          quantity: r.quantity,
          perPeriodReset: r.perPeriodReset ?? true,
          carryForwardCap: r.carryForwardCap ?? null,
          notes: r.notes ?? null,
        })),
      });
    }

    const updatedPlan = await tx.plan.update({
      where: { id },
      data,
      include: DEFAULT_INCLUDE,
    });

    if (significant) {
      const lastVersion = await tx.planVersion.findFirst({
        where: { planId: id },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (lastVersion?.version ?? 0) + 1;
      await tx.planVersion.create({
        data: {
          planId: id,
          version: nextVersion,
          publishedById: publishedById ?? null,
          diff: {
            from: {
              basePricePaise: existing.basePricePaise,
              validityDays: existing.validityDays,
              features: existing.features,
              resources: existing.resources,
            },
            to: {
              basePricePaise: updatedPlan.basePricePaise,
              validityDays: updatedPlan.validityDays,
              features: updatedPlan.features,
              resources: updatedPlan.resources,
            },
          },
        },
      });
    }
    return updatedPlan;
  });
  logger.info('Plan updated', { planId: updated.id, code: updated.code });
  return toAdminDTO(updated);
}

export async function archivePlan(id: string): Promise<AdminPlanDTO> {
  const plan = await prisma.plan.update({
    where: { id },
    data: { status: PlanStatus.ARCHIVED, isPublic: false },
    include: DEFAULT_INCLUDE,
  });
  logger.info('Plan archived', { planId: plan.id });
  return toAdminDTO(plan);
}

export async function publishPlan(id: string): Promise<AdminPlanDTO> {
  const plan = await prisma.plan.update({
    where: { id },
    data: { status: PlanStatus.ACTIVE },
    include: DEFAULT_INCLUDE,
  });
  logger.info('Plan published', { planId: plan.id });
  return toAdminDTO(plan);
}

/**
 * Idempotent upsert by `code` — used by the seed script and plan migrations.
 */
export async function upsertPlanByCode(
  input: CreatePlanInput,
  createdById?: string
): Promise<AdminPlanDTO> {
  const slug = input.slug ?? deriveSlug(input.code);
  const existing = await prisma.plan.findUnique({ where: { code: input.code } });
  if (existing) {
    return updatePlan(existing.id, { ...input, slug }, createdById);
  }
  return createPlan({ ...input, slug }, createdById);
}

export class PlanService {
  static listPublicPlans = listPublicPlans;
  static getPublicPlanByCode = getPublicPlanByCode;
  static getPublicPlanBySlug = getPublicPlanBySlug;
  static listPlansAdmin = listPlansAdmin;
  static getPlanByIdAdmin = getPlanByIdAdmin;
  static getPlanByCodeAdmin = getPlanByCodeAdmin;
  static getActivePlanByCodeRaw = getActivePlanByCodeRaw;
  static getActivePlanByIdRaw = getActivePlanByIdRaw;
  static createPlan = createPlan;
  static updatePlan = updatePlan;
  static archivePlan = archivePlan;
  static publishPlan = publishPlan;
  static upsertPlanByCode = upsertPlanByCode;
}

// guard re-export to keep AppError reachable from imports of this file
export { AppError };
