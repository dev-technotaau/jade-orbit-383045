import { z } from 'zod';
import { MAX_PLAN_PURCHASE_QUANTITY } from '@/constants';

// Razorpay only accepts string|number values in notes (max 15 keys, 256 chars each).
const optionalStringRecord = z
  .record(z.string().max(64), z.union([z.string().max(256), z.number()]))
  .optional();

export const createOrderBodySchema = z.object({
  planCode: z.string().min(2).max(64),
  // Units of the plan (1-3). Eligibility per plan is enforced in the
  // service (only stackable plans accept quantity > 1).
  quantity: z.number().int().min(1).max(MAX_PLAN_PURCHASE_QUANTITY).optional(),
  billingAddressId: z.string().uuid().nullable().optional(),
  buyerStateCode: z.string().length(2).optional(),
  buyerIsIndian: z.boolean().optional(),
  couponCode: z.string().min(2).max(64).optional(),
  buyerEmail: z.string().email().max(255).optional(),
  buyerPhone: z.string().min(6).max(20).optional(),
  buyerGstin: z.string().min(15).max(15).optional(),
  buyerLegalName: z.string().min(2).max(160).optional(),
  notes: optionalStringRecord,
});

export const verifyOrderParamsSchema = z.object({
  id: z.string().uuid('order id must be a UUID'),
});

export const verifyOrderBodySchema = z.object({
  razorpay_order_id: z.string().min(8),
  razorpay_payment_id: z.string().min(8),
  razorpay_signature: z.string().min(8),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'CREATED',
      'ATTEMPTED',
      'PAID',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'REFUND_PENDING',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      'DISPUTED',
      'FRAUD_FLAGGED',
    ])
    .optional(),
});

export const orderIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
export type VerifyOrderBody = z.infer<typeof verifyOrderBodySchema>;
