import { z } from 'zod';

export const createJobAlertSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    filters: z.record(z.string(), z.unknown()).refine((val) => Object.keys(val).length > 0, {
      message: 'At least one filter is required',
    }),
    frequency: z.enum(['INSTANT', 'DAILY', 'WEEKLY', 'OFF']).default('DAILY'),
  }),
});

export const updateJobAlertSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    frequency: z.enum(['INSTANT', 'DAILY', 'WEEKLY', 'OFF']).optional(),
    isActive: z.boolean().optional(),
  }),
});
