import { z } from 'zod';

export const createSubscriptionBodySchema = z.object({
  planCode: z.string().min(2).max(64),
  totalCount: z.number().int().min(1).max(120).nullable().optional(),
  startAt: z.string().datetime().optional(),
  customerNotify: z.boolean().optional(),
  notifyEmail: z.string().email().max(255).optional(),
  notifyPhone: z.string().min(6).max(20).optional(),
  couponCode: z.string().min(2).max(64).optional(),
  metadata: z.record(z.string().max(64), z.union([z.string().max(256), z.number()])).optional(),
});

export const subscriptionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const cancelSubscriptionBodySchema = z.object({
  reason: z.string().max(500).optional(),
  cancelImmediately: z.boolean().optional(),
});

export const pauseSubscriptionBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export const toggleAutoRenewBodySchema = z.object({
  autoRenew: z.boolean(),
  reason: z.string().max(500).optional(),
});

export type CreateSubscriptionBody = z.infer<typeof createSubscriptionBodySchema>;
export type CancelSubscriptionBody = z.infer<typeof cancelSubscriptionBodySchema>;
export type PauseSubscriptionBody = z.infer<typeof pauseSubscriptionBodySchema>;
export type ToggleAutoRenewBody = z.infer<typeof toggleAutoRenewBodySchema>;
