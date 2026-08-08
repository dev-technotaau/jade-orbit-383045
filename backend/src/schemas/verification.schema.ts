import { z } from 'zod';
import { VerificationType, VerificationStatus } from '@prisma/client';

export const requestVerificationSchema = z.object({
  body: z.object({
    type: z.nativeEnum(VerificationType, { error: 'Invalid verification type' }),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const reviewVerificationSchema = z.object({
  body: z.object({
    status: z.nativeEnum(VerificationStatus, { error: 'Invalid verification status' }),
    comments: z.string().max(2000).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const escalateVerificationSchema = z.object({
  body: z.object({
    reason: z.string().min(1).max(2000),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const listVerificationsSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
