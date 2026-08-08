import { z } from 'zod';

export const createOrderSchema = z.object({
  planCode: z.string().min(1, 'Plan code is required'),
  couponCode: z.string().optional(),
  billingAddressId: z.string().uuid().optional(),
  buyerGstNumber: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional(),
});

export const verifyOrderSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const billingAddressSchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().min(3, 'Address line 1 required'),
  line2: z.string().optional().nullable(),
  city: z.string().min(2, 'City required'),
  stateName: z.string().min(2, 'State required'),
  stateCode: z.string().regex(/^[0-9]{2}$/, '2-digit GST state code'),
  pincode: z.string().regex(/^[0-9]{6}$/, '6-digit pincode'),
  country: z.string().default('India'),
  countryCode: z.string().length(2).default('IN'),
  gstNumber: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional()
    .nullable(),
  legalName: z.string().max(120).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type VerifyOrderInput = z.infer<typeof verifyOrderSchema>;
export type BillingAddressInput = z.infer<typeof billingAddressSchema>;
