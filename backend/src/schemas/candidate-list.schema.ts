import { z } from 'zod';

export const createListSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color')
    .optional()
    .default('#6366F1'),
  icon: z.string().max(50).optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  icon: z.string().max(50).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const addCandidatesToListSchema = z.object({
  candidateIds: z
    .array(z.string().uuid())
    .min(1, 'At least one candidate required')
    .max(100, 'Max 100 candidates per operation'),
  notes: z.string().max(500).optional(),
});

export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type AddCandidatesToListInput = z.infer<typeof addCandidatesToListSchema>;
