import { z } from 'zod';
import { Role } from '@prisma/client';

export const updateUserRoleSchema = z.object({
  body: z.object({
    role: z.enum([Role.CANDIDATE, Role.EMPLOYER, Role.ADMIN]),
  }),
});

export const suspendUserSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const analyticsQuerySchema = z.object({
  query: z.object({
    period: z.enum(['week', 'month', 'quarter']).default('month'),
  }),
});

export const auditLogQuerySchema = z.object({
  query: z.object({
    action: z.string().optional(),
    entity: z.string().optional(),
    performedBy: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const flagJobSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reason is required'),
  }),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>['body'];
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>['query'];
