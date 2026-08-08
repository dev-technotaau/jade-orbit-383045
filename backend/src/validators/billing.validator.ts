import { z } from 'zod';
import {
  PlanCategory,
  PlanBillingCycle,
  PlanStatus,
  PlanFeatureKind,
  ResourceUnit,
} from '@prisma/client';

export const planCodeSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_]+$/, 'Plan code must be uppercase alphanumeric with underscores');

export const planSlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, hyphenated alphanumerics');

export const planFeatureSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_.]*$/, 'Feature key must start with a letter, lowercase'),
  label: z.string().min(1).max(160),
  kind: z.enum(PlanFeatureKind).default('BOOLEAN'),
  countableLimit: z.number().int().nonnegative().nullable().optional(),
  enumValue: z.string().max(120).nullable().optional(),
  textValue: z.string().max(500).nullable().optional(),
  included: z.boolean().default(true),
  displayOrder: z.number().int().default(100),
  description: z.string().max(500).nullable().optional(),
});

export const planResourceSchema = z.object({
  unit: z.enum(ResourceUnit),
  quantity: z.number().int().nonnegative(),
  perPeriodReset: z.boolean().default(true),
  carryForwardCap: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createPlanSchema = z.object({
  code: planCodeSchema,
  name: z.string().min(2).max(120),
  slug: planSlugSchema.optional(),
  category: z.enum(PlanCategory),
  billingCycle: z.enum(PlanBillingCycle),
  basePricePaise: z.number().int().nonnegative(),
  currency: z.string().length(3).default('INR'),
  gstRatePercent: z.number().int().min(0).max(40).default(18),
  gstInclusive: z.boolean().default(true),
  hsnCode: z.string().max(16).default('998314'),
  validityDays: z.number().int().positive().nullable().optional(),
  trialDays: z.number().int().nonnegative().default(0),
  displayOrder: z.number().int().default(100),
  highlight: z.boolean().default(false),
  badgeText: z.string().max(64).nullable().optional(),
  shortDescription: z.string().max(280).nullable().optional(),
  descriptionHtml: z.string().max(20000).nullable().optional(),
  status: z.enum(PlanStatus).default('DRAFT'),
  isPublic: z.boolean().default(true),
  isCustom: z.boolean().default(false),
  requiresQuote: z.boolean().default(false),
  razorpayPlanId: z.string().max(80).nullable().optional(),
  features: z.array(planFeatureSchema).max(50).default([]),
  resources: z.array(planResourceSchema).max(30).default([]),
  metadata: z.unknown().optional(),
});

/**
 * Optimistic-concurrency token: the `updatedAt` the editor loaded.
 *
 * MUST be declared on the schema. Zod strips unknown keys on parse, and
 * `validate()` reassigns `req.body` to the parsed result — so an
 * undeclared `expectedUpdatedAt` was silently removed before the
 * controller saw it, and `assertUnmodified` read it as "caller opted
 * out". The whole stale-write check was inert.
 */
const expectedUpdatedAt = z.string().datetime({ offset: true }).optional();

export const updatePlanSchema = createPlanSchema.partial().extend({ expectedUpdatedAt });

export const planCatalogQuerySchema = z.object({
  category: z.enum(PlanCategory).optional(),
  status: z.enum(PlanStatus).optional(),
  isPublic: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
  includeArchived: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

export type CreatePlanBody = z.infer<typeof createPlanSchema>;
export type UpdatePlanBody = z.infer<typeof updatePlanSchema>;
export type PlanCatalogQuery = z.infer<typeof planCatalogQuerySchema>;
