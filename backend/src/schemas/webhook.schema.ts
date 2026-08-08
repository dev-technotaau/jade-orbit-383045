import { z } from 'zod';

const WEBHOOK_EVENTS = [
  'job.posted',
  'job.updated',
  'job.closed',
  'application.submitted',
  'application.status_changed',
  'candidate.profile_updated',
] as const;

export const createWebhookSchema = z.object({
  body: z.object({
    url: z.string().url('Must be a valid URL').startsWith('https', 'Webhook URL must use HTTPS'),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'At least one event is required'),
    description: z.string().max(255).optional(),
  }),
});

export const updateWebhookSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    url: z.string().url().startsWith('https').optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    description: z.string().max(255).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const webhookIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export { WEBHOOK_EVENTS };
