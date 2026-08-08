import { z } from 'zod';
import { TicketCategory, TicketPriority, TicketStatus, TicketSatisfaction } from '@prisma/client';

export const createTicketSchema = z.object({
  body: z.object({
    subject: z.string().min(3).max(200),
    description: z.string().min(10).max(5000),
    category: z
      .nativeEnum(TicketCategory, { error: 'Invalid ticket category' })
      .optional()
      .default('GENERAL'),
    priority: z.nativeEnum(TicketPriority, { error: 'Invalid ticket priority' }).optional(),
  }),
});

export const createGuestTicketSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    subject: z.string().min(3).max(200),
    description: z.string().min(10).max(5000),
    category: z
      .nativeEnum(TicketCategory, { error: 'Invalid ticket category' })
      .optional()
      .default('GENERAL'),
  }),
});

export const addMessageSchema = z.object({
  body: z.object({
    body: z.string().min(1).max(5000),
    isInternal: z.boolean().optional().default(false),
    subject: z.string().max(200).optional(),
  }),
});

export const updateStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(TicketStatus, { error: 'Invalid ticket status' }),
  }),
});

export const assignTicketSchema = z.object({
  body: z.object({
    assignedToId: z.string().min(1),
  }),
});

export const submitSatisfactionSchema = z.object({
  body: z.object({
    satisfaction: z.nativeEnum(TicketSatisfaction, { error: 'Invalid satisfaction value' }),
    comment: z.string().max(1000).optional(),
  }),
});

export const ticketQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.nativeEnum(TicketStatus, { error: 'Invalid status' }).optional(),
    priority: z.nativeEnum(TicketPriority, { error: 'Invalid priority' }).optional(),
    category: z.nativeEnum(TicketCategory, { error: 'Invalid category' }).optional(),
    assignedToId: z.string().optional(),
    search: z.string().optional(),
  }),
});
