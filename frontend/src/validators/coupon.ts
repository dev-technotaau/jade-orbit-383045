import { z } from 'zod';

export const validateCouponSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{3,40}$/, '3–40 chars, A-Z 0-9 _ -'),
  planId: z.string().uuid(),
});

export const createCouponSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9_-]{3,40}$/),
    name: z.string().min(2).max(120),
    type: z.enum(['PERCENT', 'FLAT', 'FIRST_MONTH_FREE', 'TRIAL_EXTEND', 'FREE_PLAN']),
    valuePaise: z.number().int().nonnegative().optional().nullable(),
    valuePercent: z.number().int().min(0).max(100).optional().nullable(),
    maxDiscountPaise: z.number().int().nonnegative().optional().nullable(),
    trialExtendDays: z.number().int().positive().optional().nullable(),
    scope: z.enum(['GLOBAL', 'ROLE_TARGETED', 'USER_TARGETED', 'PLAN_TARGETED', 'COMBO']),
    status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED']).default('ACTIVE'),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    maxRedemptionsPerUser: z.number().int().positive().default(1),
    minOrderAmountPaise: z.number().int().nonnegative().default(0),
    allowedPlanIds: z.array(z.string().uuid()).default([]),
    excludedPlanIds: z.array(z.string().uuid()).default([]),
    allowedRoles: z.array(z.string()).default([]),
    allowedUserIds: z.array(z.string().uuid()).default([]),
    comboAllowed: z.boolean().default(false),
    stackable: z.boolean().default(false),
    autoApply: z.boolean().default(false),
    descriptionHtml: z.string().optional().nullable(),
    internalNotes: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && data.valuePercent == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuePercent'],
        message: 'Required for PERCENT',
      });
    }
    if (data.type === 'FLAT' && data.valuePaise == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuePaise'],
        message: 'Required for FLAT',
      });
    }
    if (data.type === 'TRIAL_EXTEND' && !data.trialExtendDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trialExtendDays'],
        message: 'Required for TRIAL_EXTEND',
      });
    }
  });

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
