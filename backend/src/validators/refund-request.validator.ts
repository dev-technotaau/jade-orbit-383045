import { z } from 'zod';

/** Customer-facing refund request payloads. */
export const createRefundRequestBodySchema = z.object({
  orderId: z.string().uuid('orderId must be a UUID'),
  /** Omit for the full refundable balance. */
  amountPaise: z.number().int().positive().optional(),
  /**
   * The customer's reason. Required and non-trivial — a reviewer cannot
   * adjudicate "n/a", and every request is reviewed by a human.
   */
  userReason: z
    .string()
    .trim()
    .min(10, 'Please describe the reason in at least 10 characters')
    .max(1000),
});

export const refundRequestIdParamsSchema = z.object({
  id: z.string().uuid('refund request id must be a UUID'),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid('orderId must be a UUID'),
});

export const listMyRefundRequestsQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
});

/** Super-admin queue + review payloads. */
export const listRefundRequestsAdminQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reviewRefundRequestBodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reviewNotes: z.string().trim().max(1000).optional(),
  /** Approve for less than requested (partial goodwill). */
  amountPaise: z.number().int().positive().optional(),
  speed: z.enum(['normal', 'optimum']).optional(),
  /** Required to approve a request raised outside the refund window. */
  bypassWindow: z.boolean().optional(),
});

export type CreateRefundRequestBody = z.infer<typeof createRefundRequestBodySchema>;
export type ReviewRefundRequestBody = z.infer<typeof reviewRefundRequestBodySchema>;
